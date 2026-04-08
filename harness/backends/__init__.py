"""Harness backend implementations.

Usage::

    from harness.backends import create_backend, WorkerResult

    backend = create_backend(settings)          # uses settings["backend"]
    backend = create_backend(settings, "claude") # explicit override
    backend.check_available()
    result = backend.run_worker(role, prompt, run_dir, state, output_name, schema_path)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from pathlib import Path


class WorkerResult:
    """Returned by any backend after running a worker."""

    __slots__ = ("output_text", "structured_output", "cost_usd", "session_id")

    def __init__(
        self,
        output_text: str,
        structured_output: Any = None,
        cost_usd: float = 0.0,
        session_id: Optional[str] = None,
    ) -> None:
        self.output_text = output_text
        self.structured_output = structured_output
        self.cost_usd = cost_usd
        self.session_id = session_id


def create_backend(settings: dict, cli_override: Optional[str] = None):
    """Return a backend instance based on settings or cli_override.

    Args:
        settings: Full harness settings dict (from settings.json).
        cli_override: Optional backend name from --backend CLI flag.
                      Overrides settings["backend"] when provided.

    Returns:
        A backend instance that implements check_available() and run_worker().
    """
    backend_name = cli_override or settings.get("backend", "codex")
    if backend_name == "codex":
        from harness.backends.codex_backend import CodexBackend
        return CodexBackend(settings)
    if backend_name == "claude":
        from harness.backends.claude_backend import ClaudeBackend
        return ClaudeBackend(settings)
    if backend_name == "dryrun":
        from harness.backends.dryrun_backend import DryRunBackend
        return DryRunBackend(settings)
    from harness.manager import HarnessError
    raise HarnessError(f"Unknown backend: {backend_name!r}. Choose: codex, claude, dryrun.")
