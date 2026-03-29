#!/usr/bin/env python3
"""Repo-local Codex harness manager for MFG8APS."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from string import Template
from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4


REPO_ROOT = Path(__file__).resolve().parents[1]
HARNESS_ROOT = REPO_ROOT / "harness"
RUNS_ROOT = REPO_ROOT / "docs" / "exec-plans" / "active" / "harness-runs"


class HarnessError(RuntimeError):
    """Raised when the harness cannot continue safely."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def print_stage(message: str) -> None:
    print(f"[harness] {message}", flush=True)


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def append_text(path: Path, text: str) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(text.rstrip() + "\n")


def log_event(run_dir: Path, event_type: str, payload: Dict[str, Any]) -> None:
    timeline_path = run_dir / "timeline.jsonl"
    event = {
        "timestamp": utc_now(),
        "event": event_type,
        "payload": payload,
    }
    with timeline_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def run_command(command: List[str], cwd: Path, env: Optional[Dict[str, str]] = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        cwd=str(cwd),
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def ensure_tool_available(tool: str) -> None:
    completed = run_command(["/bin/zsh", "-lc", f"command -v {tool}"], REPO_ROOT)
    if completed.returncode != 0:
        raise HarnessError(f"Required tool `{tool}` is not available in PATH.")


def ensure_codex_logged_in() -> None:
    completed = run_command(["codex", "login", "status"], REPO_ROOT)
    login_output = f"{completed.stdout}\n{completed.stderr}"
    if completed.returncode != 0 or "Logged in" not in login_output:
        raise HarnessError("Codex is not logged in. Run `codex login` first.")


def git_status_is_clean(repo_root: Path) -> bool:
    completed = run_command(["git", "status", "--porcelain"], repo_root)
    return completed.returncode == 0 and completed.stdout.strip() == ""


def ensure_clean_worktree(repo_root: Path, allow_dirty: bool) -> None:
    if allow_dirty:
        return
    if not git_status_is_clean(repo_root):
        raise HarnessError(
            "Harness requires a clean git worktree on a new run. "
            "Commit/stash changes first or rerun with `--allow-dirty`."
        )


def collect_changed_files(repo_root: Path) -> List[str]:
    diff_completed = run_command(["git", "diff", "--name-only", "--relative", "HEAD"], repo_root)
    untracked_completed = run_command(
        ["git", "ls-files", "--others", "--exclude-standard"],
        repo_root,
    )
    files: List[str] = []
    for chunk in (diff_completed.stdout, untracked_completed.stdout):
        for line in chunk.splitlines():
            value = line.strip()
            if value:
                files.append(value)
    return sorted(set(files))


def e2e_browsers_available() -> bool:
    cache_roots = [
        Path.home() / "Library" / "Caches" / "ms-playwright",
        Path.home() / ".cache" / "ms-playwright",
    ]
    for cache_root in cache_roots:
        if not cache_root.exists():
            continue
        for child in cache_root.iterdir():
            if child.name.startswith("chromium"):
                return True
    return False


def prefixes_match(changed_files: Iterable[str], prefixes: Iterable[str]) -> bool:
    normalized_prefixes = tuple(prefixes)
    for path in changed_files:
        if any(path.startswith(prefix) for prefix in normalized_prefixes):
            return True
    return False


def build_verification_commands(
    changed_files: List[str],
    settings: Dict[str, Any],
    repo_root: Path,
) -> List[str]:
    commands: List[str] = []
    verification = settings["verification"]

    backend = verification["backend"]
    if prefixes_match(changed_files, backend["prefixes"]):
        commands.extend(backend["always"])
        if prefixes_match(changed_files, backend["logic_prefixes"]):
            commands.extend(backend["logic_commands"])

    frontend = verification["frontend"]
    if prefixes_match(changed_files, frontend["prefixes"]):
        commands.extend(frontend["always"])
        if prefixes_match(changed_files, frontend["interaction_prefixes"]):
            commands.extend(frontend["interaction_commands"])

    frontend_next = verification["frontend_next"]
    if prefixes_match(changed_files, frontend_next["prefixes"]):
        commands.extend(frontend_next["always"])
        if prefixes_match(changed_files, frontend_next["ui_prefixes"]) and e2e_browsers_available():
            commands.extend(frontend_next["ui_commands"])

    solver_v4 = verification["solver_v4"]
    if prefixes_match(changed_files, solver_v4["prefixes"]):
        commands.extend(solver_v4["always"])

    agent_docs = verification["agent_docs"]
    agent_doc_candidates = [
        path
        for path in changed_files
        if any(path.startswith(prefix) for prefix in agent_docs["prefixes"])
        and not any(path.startswith(ignore_prefix) for ignore_prefix in agent_docs["ignore_prefixes"])
    ]
    if agent_doc_candidates:
        commands.extend(agent_docs["always"])

    deduped: List[str] = []
    for command in commands:
        if command not in deduped:
            deduped.append(command)
    return deduped


def determine_next_state(status: str, attempt: int, max_attempts: int) -> Tuple[str, str]:
    if status == "pass":
        return "done", "done"
    if status == "blocked":
        return "blocked", "blocked"
    if status == "fail" and attempt < max_attempts:
        return "implementing", "needs_fix"
    return "blocked", "blocked"


def load_template(path: Path) -> Template:
    return Template(path.read_text(encoding="utf-8"))


def render_prompt(template_name: str, values: Dict[str, str]) -> str:
    template = load_template(HARNESS_ROOT / "prompts" / template_name)
    return template.safe_substitute(values).strip() + "\n"


def render_list(items: Iterable[str], empty_text: str = "- none") -> str:
    rendered = [f"- {item}" for item in items if item]
    return "\n".join(rendered) if rendered else empty_text


def create_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{timestamp}-{uuid4().hex[:8]}"


def initial_state(run_id: str, task: str, max_repair_rounds: int) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "task": task,
        "phase": "planning",
        "status": "running",
        "attempt": 0,
        "max_repair_rounds": max_repair_rounds,
        "max_attempts": max_repair_rounds + 1,
        "started_at": utc_now(),
        "updated_at": utc_now(),
        "lane": None,
        "plan_summary": None,
        "changed_files": [],
        "verification_commands": [],
        "last_completed_phase": None,
        "run_dir": str(RUNS_ROOT / run_id),
    }


def update_state(run_dir: Path, state: Dict[str, Any], **updates: Any) -> Dict[str, Any]:
    state.update(updates)
    state["updated_at"] = utc_now()
    write_json(run_dir / "run_state.json", state)
    return state


def format_spec_markdown(run_id: str, task: str, plan: Dict[str, Any]) -> str:
    sections = [
        "# Harness Spec",
        "",
        f"- Run ID: `{run_id}`",
        f"- Lane: `{plan['lane']}`",
        "",
        "## User Task",
        task,
        "",
        "## Summary",
        plan["summary"],
        "",
        "## Scope",
        render_list(plan["scope"]),
        "",
        "## Files Of Interest",
        render_list(plan["files_of_interest"]),
        "",
        "## Acceptance Criteria",
        render_list(plan["acceptance_criteria"]),
        "",
        "## Verification Plan",
        render_list(plan["verification_plan"]),
        "",
        "## Risks",
        render_list(plan["risks"]),
    ]
    return "\n".join(sections)


def append_implementation_log(
    run_dir: Path,
    attempt: int,
    changed_files: List[str],
    report_markdown: str,
) -> None:
    log_path = run_dir / "implementation_log.md"
    header = f"# Implementation Log\n\n" if not log_path.exists() else ""
    section = "\n".join(
        [
            header.rstrip(),
            f"## Attempt {attempt}",
            "",
            "### Changed Files",
            render_list(changed_files),
            "",
            "### Generator Report",
            report_markdown.strip(),
            "",
        ]
    ).strip()
    if log_path.exists():
        append_text(log_path, "\n" + section + "\n")
    else:
        write_text(log_path, section)


def format_qa_report(
    attempt: int,
    changed_files: List[str],
    verification_commands: List[str],
    evaluation: Dict[str, Any],
) -> str:
    command_lines = []
    for item in evaluation["commands_run"]:
        command_lines.append(
            f"- `{item['command']}` -> exit {item['exit_code']}: {item['outcome']}"
        )
    report = [
        f"# QA Report Round {attempt}",
        "",
        f"- Status: `{evaluation['status']}`",
        f"- Summary: {evaluation['summary']}",
        "",
        "## Changed Files",
        render_list(changed_files),
        "",
        "## Verification Commands",
        render_list(verification_commands),
        "",
        "## Commands Run",
        "\n".join(command_lines) if command_lines else "- none",
        "",
        "## Blocking Findings",
        render_list(evaluation["blocking_findings"]),
        "",
        "## Non-Blocking Findings",
        render_list(evaluation["non_blocking_findings"]),
        "",
        "## Recommended Next Action",
        evaluation["recommended_next_action"],
    ]
    return "\n".join(report)


def write_final_summary(run_dir: Path, state: Dict[str, Any]) -> None:
    plan = {}
    evaluation = {}
    plan_path = run_dir / "plan.json"
    evaluation_path = run_dir / "evaluation.json"
    if plan_path.exists():
        plan = load_json(plan_path)
    if evaluation_path.exists():
        evaluation = load_json(evaluation_path)
    summary_lines = [
        "# Harness Final Summary",
        "",
        f"- Run ID: `{state['run_id']}`",
        f"- Status: `{state['status']}`",
        f"- Phase: `{state['phase']}`",
        f"- Attempt: `{state['attempt']}` / `{state['max_attempts']}`",
        "",
        "## User Task",
        state["task"],
        "",
    ]
    if plan:
        summary_lines.extend(
            [
                "## Plan Summary",
                plan["summary"],
                "",
                "## Acceptance Criteria",
                render_list(plan["acceptance_criteria"]),
                "",
            ]
        )
    summary_lines.extend(
        [
            "## Changed Files",
            render_list(state.get("changed_files", [])),
            "",
            "## Verification Commands",
            render_list(state.get("verification_commands", [])),
            "",
        ]
    )
    if evaluation:
        summary_lines.extend(
            [
                "## Evaluator Summary",
                evaluation["summary"],
                "",
                "## Blocking Findings",
                render_list(evaluation["blocking_findings"]),
                "",
                "## Recommended Next Action",
                evaluation["recommended_next_action"],
                "",
            ]
        )
    summary_lines.extend(
        [
            "## Artifacts",
            render_list(
                [
                    "plan.json",
                    "spec.md",
                    "implementation_log.md",
                    "evaluation.json",
                    "timeline.jsonl",
                    "run_state.json",
                ]
            ),
        ]
    )
    write_text(run_dir / "final_summary.md", "\n".join(summary_lines))


def run_codex_worker(
    role: str,
    prompt: str,
    run_dir: Path,
    state: Dict[str, Any],
    settings: Dict[str, Any],
    output_name: str,
    schema_path: Optional[Path] = None,
) -> str:
    codex_settings = settings["codex"]
    worker_settings = codex_settings["workers"][role]
    final_path = run_dir / output_name
    events_path = run_dir / output_name.replace(".md", ".events.jsonl").replace(".json", ".events.jsonl")
    stderr_path = run_dir / output_name.replace(".md", ".stderr.log").replace(".json", ".stderr.log")

    command = [
        "codex",
        "exec",
        "--cd",
        str(REPO_ROOT),
        "--ephemeral",
        "--json",
        "-m",
        codex_settings["model"],
        "-c",
        f"approval_policy=\"{codex_settings['approval_policy']}\"",
        "-s",
        worker_settings["sandbox"],
        "-o",
        str(final_path),
    ]
    if schema_path is not None:
        command.extend(["--output-schema", str(schema_path)])

    env = os.environ.copy()
    env["MFG8APS_HARNESS_ACTIVE"] = "1"
    env["MFG8APS_HARNESS_RUN_ID"] = state["run_id"]
    env["MFG8APS_HARNESS_ROLE"] = role

    log_event(
        run_dir,
        "worker.started",
        {
            "role": role,
            "output": output_name,
            "sandbox": worker_settings["sandbox"],
        },
    )

    with events_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open(
        "w",
        encoding="utf-8",
    ) as stderr_handle:
        completed = subprocess.run(
            command,
            cwd=str(REPO_ROOT),
            env=env,
            input=prompt,
            text=True,
            stdout=stdout_handle,
            stderr=stderr_handle,
            check=False,
        )

    if completed.returncode != 0:
        stderr_preview = stderr_path.read_text(encoding="utf-8").strip()
        raise HarnessError(
            f"Codex worker `{role}` failed with exit code {completed.returncode}. "
            f"See `{stderr_path}`. {stderr_preview[:400]}"
        )

    log_event(
        run_dir,
        "worker.completed",
        {
            "role": role,
            "output": output_name,
        },
    )
    return final_path.read_text(encoding="utf-8").strip()


def new_run(task: str, settings: Dict[str, Any]) -> Tuple[Path, Dict[str, Any]]:
    run_id = create_run_id()
    run_dir = RUNS_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    state = initial_state(run_id, task, settings["max_repair_rounds"])
    write_text(run_dir / "user_prompt.md", task)
    write_json(run_dir / "run_state.json", state)
    log_event(run_dir, "run.created", {"task": task})
    return run_dir, state


def load_run(run_id: str) -> Tuple[Path, Dict[str, Any]]:
    run_dir = RUNS_ROOT / run_id
    state_path = run_dir / "run_state.json"
    if not state_path.exists():
        raise HarnessError(f"Run `{run_id}` does not exist.")
    return run_dir, load_json(state_path)


def run_planning(run_dir: Path, state: Dict[str, Any], settings: Dict[str, Any]) -> Dict[str, Any]:
    print_stage(f"run={state['run_id']} phase=planning")
    prompt = render_prompt(
        "planner.md",
        {
            "task": state["task"],
            "run_id": state["run_id"],
        },
    )
    plan_text = run_codex_worker(
        role="planner",
        prompt=prompt,
        run_dir=run_dir,
        state=state,
        settings=settings,
        output_name="plan.json",
        schema_path=HARNESS_ROOT / "schemas" / "planner_output.schema.json",
    )
    plan = json.loads(plan_text)
    write_json(run_dir / "plan.json", plan)
    write_text(run_dir / "spec.md", format_spec_markdown(state["run_id"], state["task"], plan))
    update_state(
        run_dir,
        state,
        phase="implementing",
        status="running",
        lane=plan["lane"],
        plan_summary=plan["summary"],
        last_completed_phase="planning",
    )
    log_event(run_dir, "phase.completed", {"phase": "planning"})
    return plan


def run_generator(run_dir: Path, state: Dict[str, Any], settings: Dict[str, Any]) -> List[str]:
    attempt = int(state["attempt"]) + 1
    update_state(run_dir, state, attempt=attempt, status="running")
    print_stage(f"run={state['run_id']} phase=implementing attempt={attempt}/{state['max_attempts']}")
    plan = load_json(run_dir / "plan.json")
    spec_markdown = (run_dir / "spec.md").read_text(encoding="utf-8")
    prior_feedback_path = run_dir / f"qa_report_round_{attempt - 1}.md"
    prior_feedback = (
        prior_feedback_path.read_text(encoding="utf-8")
        if prior_feedback_path.exists()
        else "No prior evaluator feedback. This is the first implementation attempt."
    )
    prompt = render_prompt(
        "generator.md",
        {
            "run_id": state["run_id"],
            "attempt": str(attempt),
            "max_attempts": str(state["max_attempts"]),
            "task": state["task"],
            "plan_json": json.dumps(plan, ensure_ascii=False, indent=2),
            "spec_markdown": spec_markdown,
            "prior_feedback": prior_feedback,
        },
    )
    report_markdown = run_codex_worker(
        role="generator",
        prompt=prompt,
        run_dir=run_dir,
        state=state,
        settings=settings,
        output_name=f"generator_round_{attempt}.md",
    )
    changed_files = collect_changed_files(REPO_ROOT)
    verification_commands = build_verification_commands(changed_files, settings, REPO_ROOT)
    append_implementation_log(run_dir, attempt, changed_files, report_markdown)
    update_state(
        run_dir,
        state,
        phase="evaluating",
        status="running",
        changed_files=changed_files,
        verification_commands=verification_commands,
        last_completed_phase="implementing",
    )
    log_event(
        run_dir,
        "phase.completed",
        {
            "phase": "implementing",
            "attempt": attempt,
            "changed_files": changed_files,
        },
    )
    return changed_files


def run_evaluator(run_dir: Path, state: Dict[str, Any], settings: Dict[str, Any]) -> Dict[str, Any]:
    attempt = int(state["attempt"])
    print_stage(f"run={state['run_id']} phase=evaluating attempt={attempt}/{state['max_attempts']}")
    plan = load_json(run_dir / "plan.json")
    spec_markdown = (run_dir / "spec.md").read_text(encoding="utf-8")
    implementation_summary = (run_dir / f"generator_round_{attempt}.md").read_text(encoding="utf-8")
    changed_files = state.get("changed_files", [])
    verification_commands = state.get("verification_commands", [])
    prompt = render_prompt(
        "evaluator.md",
        {
            "run_id": state["run_id"],
            "attempt": str(attempt),
            "max_attempts": str(state["max_attempts"]),
            "task": state["task"],
            "plan_json": json.dumps(plan, ensure_ascii=False, indent=2),
            "spec_markdown": spec_markdown,
            "changed_files": render_list(changed_files),
            "verification_commands": render_list(verification_commands),
            "implementation_summary": implementation_summary,
        },
    )
    evaluation_text = run_codex_worker(
        role="evaluator",
        prompt=prompt,
        run_dir=run_dir,
        state=state,
        settings=settings,
        output_name="evaluation.json",
        schema_path=HARNESS_ROOT / "schemas" / "evaluator_output.schema.json",
    )
    evaluation = json.loads(evaluation_text)
    write_json(run_dir / "evaluation.json", evaluation)
    write_text(
        run_dir / f"qa_report_round_{attempt}.md",
        format_qa_report(attempt, changed_files, verification_commands, evaluation),
    )

    next_phase, next_status = determine_next_state(
        evaluation["status"],
        attempt,
        int(state["max_attempts"]),
    )
    update_state(
        run_dir,
        state,
        phase=next_phase,
        status=next_status,
        last_completed_phase="evaluating",
    )
    log_event(
        run_dir,
        "phase.completed",
        {
            "phase": "evaluating",
            "attempt": attempt,
            "status": evaluation["status"],
        },
    )
    return evaluation


def run_loop(run_dir: Path, state: Dict[str, Any], settings: Dict[str, Any]) -> int:
    while state["phase"] not in ("done", "blocked"):
        if state["phase"] == "planning":
            run_planning(run_dir, state, settings)
            continue
        if state["phase"] == "implementing":
            run_generator(run_dir, state, settings)
            continue
        if state["phase"] == "evaluating":
            evaluation = run_evaluator(run_dir, state, settings)
            if state["phase"] == "implementing":
                print_stage(
                    f"run={state['run_id']} status=needs_fix "
                    f"attempt={state['attempt']} summary={evaluation['summary']}"
                )
            continue
        raise HarnessError(f"Unknown phase `{state['phase']}`.")

    write_final_summary(run_dir, state)
    final_summary = (run_dir / "final_summary.md").read_text(encoding="utf-8")
    print_stage(f"run={state['run_id']} status={state['status']} artifacts={run_dir}")
    print(final_summary)
    return 0 if state["status"] == "done" else 1


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the MFG8APS Codex harness.")
    parser.add_argument("task_text", nargs="?", help="Optional task text for a new run.")
    parser.add_argument("--task", dest="task_flag", help="Task text for a new run.")
    parser.add_argument("--resume", help="Resume an existing run by run id.")
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Allow starting a new run with a dirty worktree.",
    )
    return parser.parse_args(argv)


def resolve_task(args: argparse.Namespace) -> str:
    task = args.task_flag or args.task_text
    if not task:
        raise HarnessError("Provide a task string or use --resume <run-id>.")
    return task.strip()


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    settings = load_json(HARNESS_ROOT / "config" / "settings.json")
    ensure_tool_available("codex")
    ensure_tool_available("python3")
    ensure_codex_logged_in()

    if args.resume:
        run_dir, state = load_run(args.resume)
    else:
        ensure_clean_worktree(REPO_ROOT, allow_dirty=args.allow_dirty)
        task = resolve_task(args)
        run_dir, state = new_run(task, settings)

    log_event(run_dir, "run.started", {"phase": state["phase"], "status": state["status"]})
    return run_loop(run_dir, state, settings)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except HarnessError as exc:
        print_stage(f"error={exc}")
        sys.exit(1)
