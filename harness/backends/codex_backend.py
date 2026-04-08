"""Codex (OpenAI) backend for the MFG8APS harness.

Extracted directly from the original run_codex_worker() function in manager.py.
No behavioral changes — this is a lift-and-shift into the backend protocol.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

from harness.backends import WorkerResult


REPO_ROOT = Path(__file__).resolve().parents[2]


class CodexBackend:
    """Drives worker agents via `codex exec`."""

    def __init__(self, settings: Dict[str, Any]) -> None:
        self._settings = settings

    # ------------------------------------------------------------------
    # Backend protocol
    # ------------------------------------------------------------------

    def check_available(self) -> None:
        """Raise HarnessError if codex CLI is unavailable or not logged in."""
        from harness.manager import HarnessError, run_command

        result = run_command(["/bin/zsh", "-lc", "command -v codex"], REPO_ROOT)
        if result.returncode != 0:
            raise HarnessError("Required tool `codex` is not available in PATH.")

        login = run_command(["codex", "login", "status"], REPO_ROOT)
        login_output = f"{login.stdout}\n{login.stderr}"
        if login.returncode != 0 or "Logged in" not in login_output:
            raise HarnessError("Codex is not logged in. Run `codex login` first.")

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

        codex_settings = self._settings["codex"]
        worker_settings = codex_settings["workers"][role]
        final_path = run_dir / output_name
        output_stem = Path(output_name).stem
        events_path = run_dir / f"{output_stem}.events.jsonl"
        stderr_path = run_dir / f"{output_stem}.stderr.log"

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
            "-c",
            f"model_reasoning_effort=\"{worker_settings.get('reasoning_effort', 'medium')}\"",
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
                "backend": "codex",
                "output": output_name,
                "sandbox": worker_settings["sandbox"],
            },
        )

        with events_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open(
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

        if completed.returncode != 0:
            stderr_preview = stderr_path.read_text(encoding="utf-8").strip()
            raise HarnessError(
                f"Codex worker `{role}` failed with exit code {completed.returncode}. "
                f"See `{stderr_path}`. {stderr_preview[:400]}"
            )

        log_event(run_dir, "worker.completed", {"role": role, "backend": "codex", "output": output_name})
        output_text = final_path.read_text(encoding="utf-8").strip()
        return WorkerResult(output_text=output_text)
