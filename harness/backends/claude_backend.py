"""Claude Code backend for the MFG8APS harness.

Uses `claude -p` (headless/print mode) to drive worker agents.

Auth note: This backend uses the user's existing Claude Code OAuth session
(claude.ai login). It does NOT use --bare mode, which would require
ANTHROPIC_API_KEY. Without --bare, AGENTS.md and CLAUDE.md are auto-loaded
into the worker's system context — meaning the prompts' claim that
"AGENTS.md is already in your system context" is true.

Output format: claude -p --output-format json returns a JSON envelope:
  {
    "type": "result",
    "result": "<text output>",
    "structured_output": { ... },  // present when --json-schema is used
    "total_cost_usd": 0.03,
    "session_id": "...",
    "is_error": false,
    ...
  }
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

from harness.backends import WorkerResult

REPO_ROOT = Path(__file__).resolve().parents[2]

# Permission mode mapping per role.
# planner and reviewer are read-only; generator and evaluator need write access.
_DEFAULT_PERMISSION_MODE: Dict[str, str] = {
    "planner": "plan",
    "reviewer": "plan",
    "generator": "default",
    "evaluator": "default",
}

# Default allowed tools per role if not configured in settings.
_DEFAULT_ALLOWED_TOOLS: Dict[str, str] = {
    "planner": "Read,Grep,Glob,Bash(head *),Bash(rg *),Bash(grep *)",
    "reviewer": "Read,Grep,Glob,Bash(head *),Bash(rg *)",
    "generator": "Bash,Read,Edit,Write,Grep,Glob",
    "evaluator": "Bash,Read,Grep,Glob",
}


class ClaudeBackend:
    """Drives worker agents via `claude -p` (Claude Code headless mode)."""

    def __init__(self, settings: Dict[str, Any]) -> None:
        self._settings = settings
        self._claude_cfg = settings.get("claude", {})

    # ------------------------------------------------------------------
    # Backend protocol
    # ------------------------------------------------------------------

    def check_available(self) -> None:
        """Raise HarnessError if claude CLI is unavailable or not logged in."""
        from harness.manager import HarnessError, run_command

        result = run_command(["/bin/zsh", "-lc", "command -v claude"], REPO_ROOT)
        if result.returncode != 0:
            raise HarnessError(
                "Required tool `claude` is not available in PATH. "
                "Install Claude Code: https://claude.ai/code"
            )

        # Check auth via `claude auth status` (returns JSON).
        auth = run_command(["claude", "auth", "status"], REPO_ROOT)
        try:
            auth_data = json.loads(auth.stdout.strip())
            if not auth_data.get("loggedIn", False):
                raise HarnessError(
                    "Claude Code is not logged in. Run `claude login` first."
                )
        except (json.JSONDecodeError, KeyError):
            # If the output is not JSON, fall back to string check.
            if "loggedIn" not in auth.stdout and auth.returncode != 0:
                raise HarnessError(
                    "Claude Code auth check failed. Run `claude login` first."
                )

    def run_worker(
        self,
        role: str,
        prompt: str,
        run_dir: Path,
        state: Dict[str, Any],
        output_name: str,
        schema_path: Optional[Path] = None,
    ) -> WorkerResult:
        from harness.manager import HarnessError, log_event

        worker_settings = self._claude_cfg.get("workers", {}).get(role, {})
        default_model = self._claude_cfg.get("default_model", "opus")
        model = worker_settings.get("model", default_model)
        effort = worker_settings.get("reasoning_effort", "medium")
        permission_mode = worker_settings.get(
            "permission_mode", _DEFAULT_PERMISSION_MODE.get(role, "default")
        )
        allowed_tools = worker_settings.get(
            "allowed_tools", _DEFAULT_ALLOWED_TOOLS.get(role, "Bash,Read,Edit,Grep,Glob")
        )
        max_budget = self._claude_cfg.get("max_budget_usd")

        output_stem = Path(output_name).stem
        stdout_path = run_dir / f"{output_stem}.stdout.json"
        stderr_path = run_dir / f"{output_stem}.stderr.log"
        final_path = run_dir / output_name

        command = [
            "claude",
            "-p",
            "--model", model,
            "--effort", effort,
            "--output-format", "json",
            "--permission-mode", permission_mode,
            "--allowedTools", allowed_tools,
        ]
        if max_budget is not None:
            command.extend(["--max-budget-usd", str(max_budget)])
        if schema_path is not None:
            schema_content = schema_path.read_text(encoding="utf-8").strip()
            command.extend(["--json-schema", schema_content])

        env = os.environ.copy()
        env["MFG8APS_HARNESS_ACTIVE"] = "1"
        env["MFG8APS_HARNESS_RUN_ID"] = state["run_id"]
        env["MFG8APS_HARNESS_ROLE"] = role

        log_event(
            run_dir,
            "worker.started",
            {
                "role": role,
                "backend": "claude",
                "model": model,
                "effort": effort,
                "permission_mode": permission_mode,
                "output": output_name,
            },
        )

        with stdout_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open(
            "w", encoding="utf-8"
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

        # Parse the JSON envelope from stdout.
        envelope: Dict[str, Any] = {}
        try:
            raw = stdout_path.read_text(encoding="utf-8").strip()
            if raw:
                envelope = json.loads(raw)
        except (json.JSONDecodeError, OSError):
            pass

        if completed.returncode != 0 or envelope.get("is_error", False):
            stderr_preview = stderr_path.read_text(encoding="utf-8").strip()
            result_preview = envelope.get("result", "")[:200]
            raise HarnessError(
                f"Claude worker `{role}` failed (exit {completed.returncode}). "
                f"result={result_preview!r} stderr={stderr_preview[:200]}"
            )

        # Extract output: structured_output when schema was used, else result text.
        structured = envelope.get("structured_output")
        output_text: str
        if schema_path is not None and structured is not None:
            # Write canonical JSON for schema-validated output.
            output_text = json.dumps(structured, ensure_ascii=False, indent=2)
        else:
            output_text = envelope.get("result", "").strip()

        final_path.write_text(output_text + "\n", encoding="utf-8")

        cost_usd = float(envelope.get("total_cost_usd", 0.0))
        session_id = envelope.get("session_id")

        log_event(
            run_dir,
            "worker.completed",
            {
                "role": role,
                "backend": "claude",
                "model": model,
                "output": output_name,
                "cost_usd": cost_usd,
                "session_id": session_id,
            },
        )
        return WorkerResult(
            output_text=output_text,
            structured_output=structured,
            cost_usd=cost_usd,
            session_id=session_id,
        )
