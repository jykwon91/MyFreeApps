"""Contract tests for ``platform_shared.core.git.resolve_git_commit``.

Behavior precedence:
  1. ``GIT_COMMIT`` env var (highest priority)
  2. ``git rev-parse --short HEAD`` fallback
  3. ``"unknown"`` literal (last resort)

Never raises.
"""
from __future__ import annotations

import os
import subprocess
from unittest.mock import patch

from platform_shared.core.git import resolve_git_commit


class TestResolveGitCommit:
    def test_returns_env_var_when_set(self, monkeypatch) -> None:
        monkeypatch.setenv("GIT_COMMIT", "deadbeef")
        assert resolve_git_commit() == "deadbeef"

    def test_strips_env_var_whitespace(self, monkeypatch) -> None:
        monkeypatch.setenv("GIT_COMMIT", "  abc1234  \n")
        assert resolve_git_commit() == "abc1234"

    def test_falls_back_to_git_when_env_var_empty(self, monkeypatch) -> None:
        monkeypatch.delenv("GIT_COMMIT", raising=False)
        with patch(
            "platform_shared.core.git.subprocess.check_output",
            return_value="cafebabe\n",
        ) as mock_check:
            result = resolve_git_commit()
        assert result == "cafebabe"
        mock_check.assert_called_once_with(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        )

    def test_falls_back_to_unknown_when_git_fails(self, monkeypatch) -> None:
        monkeypatch.delenv("GIT_COMMIT", raising=False)
        with patch(
            "platform_shared.core.git.subprocess.check_output",
            side_effect=FileNotFoundError("git not on PATH"),
        ):
            assert resolve_git_commit() == "unknown"

    def test_swallows_subprocess_error(self, monkeypatch) -> None:
        """Any exception during the subprocess call → 'unknown', no raise."""
        monkeypatch.delenv("GIT_COMMIT", raising=False)
        with patch(
            "platform_shared.core.git.subprocess.check_output",
            side_effect=subprocess.CalledProcessError(128, ["git"]),
        ):
            assert resolve_git_commit() == "unknown"

    def test_env_var_takes_precedence_over_git(self, monkeypatch) -> None:
        """Env var wins even if `git rev-parse` would have returned a value."""
        monkeypatch.setenv("GIT_COMMIT", "from_env")
        with patch(
            "platform_shared.core.git.subprocess.check_output",
            return_value="from_git",
        ) as mock_check:
            result = resolve_git_commit()
        assert result == "from_env"
        mock_check.assert_not_called()
