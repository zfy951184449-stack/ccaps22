"""Dry-run backend for the MFG8APS harness.

Returns minimal valid canned outputs for every worker role.
Never calls any LLM. Used for:
  - Testing the full state machine without spending tokens
  - Validating bundle generation, verification routing, and artifact writing
  - CI smoke tests

Usage:
  python3 harness/manager.py --dry-run --task "test task"
  python3 harness/manager.py --backend dryrun --task "test task"
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

from harness.backends import WorkerResult

# ---------------------------------------------------------------------------
# Minimal valid canned outputs per role
# ---------------------------------------------------------------------------

_CANNED_PLAN: Dict[str, Any] = {
    "lane": "docs",
    "summary": "[dry-run] No real plan generated. This is a dry-run.",
    "scope": ["[dry-run] placeholder scope item"],
    "files_of_interest": ["AGENTS.md"],
    "file_read_hints": [
        {"file": "AGENTS.md", "strategy": "head", "max_lines": 10}
    ],
    "acceptance_criteria": ["[dry-run] placeholder criterion"],
    "verification_plan": ["scripts/lint_agent_docs.sh"],
    "risks": [],
}

_CANNED_REVIEW: Dict[str, Any] = {
    "status": "pass",
    "summary": "[dry-run] Plan review skipped. Proceeding to generator.",
    "findings": [],
    "replan_guidance": "",
}

_CANNED_EVALUATION: Dict[str, Any] = {
    "status": "pass",
    "summary": "[dry-run] Evaluation skipped. No real verification ran.",
    "commands_run": [],
    "blocking_findings": [],
    "non_blocking_findings": ["[dry-run] No verification was performed."],
    "recommended_next_action": "[dry-run] Mark as done.",
}

_CANNED_GENERATOR_MD = """\
## Summary
[dry-run] No implementation was performed.

## Files Touched
- none

## Checks Run
- none

## Self-Evaluation
- [dry-run] All criteria skipped.

## Residual Risks
- [dry-run] This was a dry run; no real changes were made.
"""


def _canned_output_for_role(role: str) -> str:
    if role == "planner":
        return json.dumps(_CANNED_PLAN, ensure_ascii=False, indent=2)
    if role == "reviewer":
        return json.dumps(_CANNED_REVIEW, ensure_ascii=False, indent=2)
    if role == "evaluator":
        return json.dumps(_CANNED_EVALUATION, ensure_ascii=False, indent=2)
    # generator
    return _CANNED_GENERATOR_MD


class DryRunBackend:
    """Returns canned outputs without calling any LLM."""

    def __init__(self, settings: Dict[str, Any]) -> None:
        self._settings = settings

    def check_available(self) -> None:
        """Always succeeds — no external tool required."""
        return

    def run_worker(
        self,
        role: str,
        prompt: str,
        run_dir: Path,
        state: Dict[str, Any],
        output_name: str,
        schema_path: Optional[Path] = None,
    ) -> WorkerResult:
        from harness.manager import log_event

        log_event(
            run_dir,
            "worker.started",
            {"role": role, "backend": "dryrun", "output": output_name},
        )

        output_text = _canned_output_for_role(role)
        final_path = run_dir / output_name
        final_path.write_text(output_text + "\n", encoding="utf-8")

        structured: Any = None
        if schema_path is not None and role in ("planner", "reviewer", "evaluator"):
            try:
                structured = json.loads(output_text)
            except json.JSONDecodeError:
                structured = None

        log_event(
            run_dir,
            "worker.completed",
            {"role": role, "backend": "dryrun", "output": output_name},
        )
        return WorkerResult(
            output_text=output_text,
            structured_output=structured,
            cost_usd=0.0,
            session_id=None,
        )
