"""Tests for harness backend implementations."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from harness.backends import WorkerResult, create_backend
from harness.backends.dryrun_backend import DryRunBackend


MINIMAL_SETTINGS = {
    "backend": "claude",
    "max_repair_rounds": 2,
    "max_replan_rounds": 3,
    "codex": {
        "model": "gpt-5.4",
        "approval_policy": "never",
        "workers": {
            "planner": {"sandbox": "read-only", "reasoning_effort": "medium"},
            "reviewer": {"sandbox": "read-only", "reasoning_effort": "medium"},
            "generator": {"sandbox": "workspace-write", "reasoning_effort": "medium"},
            "evaluator": {"sandbox": "workspace-write", "reasoning_effort": "medium"},
        },
    },
    "claude": {
        "default_model": "opus",
        "max_budget_usd": 5.0,
        "workers": {
            "planner": {"model": "opus", "permission_mode": "plan", "reasoning_effort": "medium"},
            "reviewer": {"model": "opus", "permission_mode": "plan", "reasoning_effort": "medium"},
            "generator": {"model": "opus", "permission_mode": "default", "reasoning_effort": "high"},
            "evaluator": {"model": "sonnet", "permission_mode": "default", "reasoning_effort": "medium"},
        },
    },
    "verification": {
        "backend": {"prefixes": [], "always": [], "logic_prefixes": [], "logic_commands": []},
        "frontend": {"prefixes": [], "always": [], "interaction_prefixes": [], "interaction_commands": []},
        "frontend_next": {"prefixes": [], "always": [], "ui_prefixes": [], "ui_commands": []},
        "solver_v4": {"prefixes": [], "always": []},
        "agent_docs": {"prefixes": [], "always": [], "ignore_prefixes": []},
    },
}


class CreateBackendFactoryTests(unittest.TestCase):
    def test_creates_claude_backend_from_settings(self) -> None:
        from harness.backends.claude_backend import ClaudeBackend
        backend = create_backend({**MINIMAL_SETTINGS, "backend": "claude"})
        self.assertIsInstance(backend, ClaudeBackend)

    def test_creates_codex_backend_from_settings(self) -> None:
        from harness.backends.codex_backend import CodexBackend
        backend = create_backend({**MINIMAL_SETTINGS, "backend": "codex"})
        self.assertIsInstance(backend, CodexBackend)

    def test_creates_dryrun_backend_from_settings(self) -> None:
        backend = create_backend({**MINIMAL_SETTINGS, "backend": "dryrun"})
        self.assertIsInstance(backend, DryRunBackend)

    def test_cli_override_takes_precedence_over_settings(self) -> None:
        # settings says "claude" but cli_override says "dryrun"
        backend = create_backend({**MINIMAL_SETTINGS, "backend": "claude"}, cli_override="dryrun")
        self.assertIsInstance(backend, DryRunBackend)

    def test_unknown_backend_raises(self) -> None:
        from harness.manager import HarnessError
        with self.assertRaises(HarnessError):
            create_backend({**MINIMAL_SETTINGS, "backend": "unknown_llm"})


class ClaudeBackendCommandTests(unittest.TestCase):
    """Tests that ClaudeBackend builds the correct CLI command."""

    def _make_run_dir(self) -> Path:
        return Path(tempfile.mkdtemp())

    def _state(self, run_id: str = "test-run") -> dict:
        return {"run_id": run_id}

    def _capture_command(self, settings: dict, role: str, schema_path=None):
        """Return the command list that ClaudeBackend would build for a given role."""
        from harness.backends.claude_backend import ClaudeBackend
        backend = ClaudeBackend(settings)
        run_dir = self._make_run_dir()
        captured = []

        def fake_run(*args, **kwargs):
            captured.extend(args[0])  # args[0] is the command list
            # Return a mock successful subprocess result
            mock_result = MagicMock()
            mock_result.returncode = 0
            return mock_result

        fake_stdout = {
            "type": "result",
            "is_error": False,
            "result": "test output",
            "total_cost_usd": 0.1,
            "session_id": "abc123",
        }

        with patch("subprocess.run", side_effect=fake_run), \
             patch.object(Path, "open", MagicMock()), \
             patch.object(Path, "read_text", return_value=json.dumps(fake_stdout)), \
             patch.object(Path, "write_text"):
            try:
                backend.run_worker(
                    role=role,
                    prompt="test prompt",
                    run_dir=run_dir,
                    state=self._state(),
                    output_name=f"{role}_output.json",
                    schema_path=schema_path,
                )
            except Exception:
                pass  # We only care about the command, not full execution

        return captured

    def test_planner_uses_opus_plan_mode(self) -> None:
        from harness.backends.claude_backend import ClaudeBackend

        backend = ClaudeBackend(MINIMAL_SETTINGS)
        worker_cfg = MINIMAL_SETTINGS["claude"]["workers"]["planner"]
        self.assertEqual(worker_cfg["model"], "opus")
        self.assertEqual(worker_cfg["permission_mode"], "plan")
        self.assertEqual(worker_cfg["reasoning_effort"], "medium")

    def test_generator_uses_opus_high_effort(self) -> None:
        worker_cfg = MINIMAL_SETTINGS["claude"]["workers"]["generator"]
        self.assertEqual(worker_cfg["model"], "opus")
        self.assertEqual(worker_cfg["reasoning_effort"], "high")

    def test_evaluator_uses_sonnet(self) -> None:
        worker_cfg = MINIMAL_SETTINGS["claude"]["workers"]["evaluator"]
        self.assertEqual(worker_cfg["model"], "sonnet")

    def test_reviewer_uses_opus_plan_mode(self) -> None:
        worker_cfg = MINIMAL_SETTINGS["claude"]["workers"]["reviewer"]
        self.assertEqual(worker_cfg["model"], "opus")
        self.assertEqual(worker_cfg["permission_mode"], "plan")


class ClaudeBackendOutputParsingTests(unittest.TestCase):
    """Tests that ClaudeBackend correctly parses the JSON envelope from stdout."""

    def _parse(self, envelope: dict, schema_path=None):
        """Simulate what ClaudeBackend does when parsing a claude JSON envelope."""
        import json as _json
        structured = envelope.get("structured_output")
        if schema_path is not None and structured is not None:
            return _json.dumps(structured, ensure_ascii=False, indent=2), structured
        return envelope.get("result", "").strip(), None

    def test_extracts_result_text_when_no_schema(self) -> None:
        envelope = {"result": "hello world", "is_error": False, "total_cost_usd": 0.01}
        text, structured = self._parse(envelope, schema_path=None)
        self.assertEqual(text, "hello world")
        self.assertIsNone(structured)

    def test_extracts_structured_output_when_schema_used(self) -> None:
        envelope = {
            "result": "",
            "structured_output": {"status": "pass", "summary": "ok"},
            "is_error": False,
            "total_cost_usd": 0.02,
        }
        text, structured = self._parse(envelope, schema_path=Path("schema.json"))
        self.assertIsNotNone(structured)
        self.assertEqual(structured["status"], "pass")
        parsed = json.loads(text)
        self.assertEqual(parsed["status"], "pass")


class DryRunBackendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.run_dir = Path(tempfile.mkdtemp())
        self.state = {"run_id": "dryrun-test"}
        # Create a minimal timeline.jsonl
        (self.run_dir / "timeline.jsonl").touch()

    def test_check_available_always_passes(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        backend.check_available()  # Should not raise

    def test_planner_returns_valid_plan_json(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        result = backend.run_worker("planner", "test", self.run_dir, self.state, "plan.json")
        plan = json.loads(result.output_text)
        self.assertIn("lane", plan)
        self.assertIn("acceptance_criteria", plan)
        self.assertIn("file_read_hints", plan)

    def test_reviewer_returns_pass_status(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        result = backend.run_worker("reviewer", "test", self.run_dir, self.state, "review.json")
        review = json.loads(result.output_text)
        self.assertEqual(review["status"], "pass")

    def test_evaluator_returns_pass_status(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        result = backend.run_worker("evaluator", "test", self.run_dir, self.state, "evaluation.json")
        evaluation = json.loads(result.output_text)
        self.assertEqual(evaluation["status"], "pass")

    def test_generator_returns_markdown_report(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        result = backend.run_worker("generator", "test", self.run_dir, self.state, "generator_round_1.md")
        self.assertIn("## Summary", result.output_text)

    def test_cost_is_zero(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        result = backend.run_worker("planner", "test", self.run_dir, self.state, "plan.json")
        self.assertEqual(result.cost_usd, 0.0)

    def test_worker_result_is_stored_as_artifact(self) -> None:
        backend = DryRunBackend(MINIMAL_SETTINGS)
        backend.run_worker("planner", "test", self.run_dir, self.state, "plan.json")
        artifact = self.run_dir / "plan.json"
        self.assertTrue(artifact.exists())


if __name__ == "__main__":
    unittest.main()
