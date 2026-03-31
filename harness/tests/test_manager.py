import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess

from harness.manager import (
    build_verification_commands,
    capture_file_hashes,
    compute_delta_files,
    determine_next_state,
    list_dirty_files,
)


class VerificationPlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_root = Path(tempfile.mkdtemp())
        self.settings = {
            "verification": {
                "backend": {
                    "prefixes": ["backend/"],
                    "always": ["cd backend && npm run build"],
                    "logic_prefixes": ["backend/src/services/"],
                    "logic_commands": ["cd backend && npm run test:ci"],
                },
                "frontend": {
                    "prefixes": ["frontend/"],
                    "always": ["cd frontend && npm run build"],
                    "interaction_prefixes": ["frontend/src/"],
                    "interaction_commands": ["cd frontend && npm run test:ci"],
                },
                "frontend_next": {
                    "prefixes": ["frontend-next/"],
                    "always": [
                        "cd frontend-next && npm run build",
                        "cd frontend-next && npm run test:ci",
                    ],
                    "ui_prefixes": ["frontend-next/src/app/"],
                    "ui_commands": ["cd frontend-next && npm run e2e"],
                },
                "solver_v4": {
                    "prefixes": ["solver_v4/"],
                    "always": ["cd solver_v4 && python3 -m unittest discover -s tests"],
                },
                "agent_docs": {
                    "prefixes": ["AGENTS.md", ".agent/", "docs/"],
                    "always": ["scripts/lint_agent_docs.sh"],
                    "ignore_prefixes": ["docs/exec-plans/active/harness-runs/"],
                },
            }
        }

    def test_backend_logic_changes_include_build_and_tests(self) -> None:
        commands = build_verification_commands(
            ["backend/src/services/foo.ts"],
            self.settings,
            self.repo_root,
        )
        self.assertEqual(
            commands,
            [
                "cd backend && npm run build",
                "cd backend && npm run test:ci",
            ],
        )

    @patch("harness.manager.e2e_browsers_available", return_value=True)
    def test_frontend_next_ui_changes_include_e2e_when_browsers_exist(self, _mock_browser_check) -> None:
        commands = build_verification_commands(
            ["frontend-next/src/app/page.tsx"],
            self.settings,
            self.repo_root,
        )
        self.assertEqual(
            commands,
            [
                "cd frontend-next && npm run build",
                "cd frontend-next && npm run test:ci",
                "cd frontend-next && npm run e2e",
            ],
        )

    def test_agent_docs_changes_ignore_harness_runs(self) -> None:
        commands = build_verification_commands(
            [
                "docs/exec-plans/active/harness-runs/20260329/final_summary.md",
                "docs/codex-harness.md",
            ],
            self.settings,
            self.repo_root,
        )
        self.assertEqual(commands, ["scripts/lint_agent_docs.sh"])


class EvaluationTransitionTests(unittest.TestCase):
    def test_pass_transitions_to_done(self) -> None:
        self.assertEqual(determine_next_state("pass", 1, 3), ("done", "done"))

    def test_fail_before_limit_requests_repair(self) -> None:
        self.assertEqual(determine_next_state("fail", 1, 3), ("implementing", "needs_fix"))

    def test_fail_at_limit_blocks(self) -> None:
        self.assertEqual(determine_next_state("fail", 3, 3), ("blocked", "blocked"))


class DirtyWorktreeIsolationTests(unittest.TestCase):
    def test_delta_files_only_include_changes_since_baseline(self) -> None:
        repo_root = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init"], cwd=repo_root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "codex@example.com"], cwd=repo_root, check=True)
        subprocess.run(["git", "config", "user.name", "Codex"], cwd=repo_root, check=True)

        tracked = repo_root / "tracked.txt"
        untouched_dirty = repo_root / "untouched.txt"
        tracked.write_text("base\n", encoding="utf-8")
        untouched_dirty.write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "add", "tracked.txt", "untouched.txt"], cwd=repo_root, check=True)
        subprocess.run(["git", "commit", "-m", "initial"], cwd=repo_root, check=True, capture_output=True)

        untouched_dirty.write_text("already dirty\n", encoding="utf-8")
        baseline = capture_file_hashes(repo_root, list_dirty_files(repo_root))

        tracked.write_text("changed in run\n", encoding="utf-8")
        delta = compute_delta_files(repo_root, baseline)

        self.assertEqual(delta, ["tracked.txt"])


if __name__ == "__main__":
    unittest.main()
