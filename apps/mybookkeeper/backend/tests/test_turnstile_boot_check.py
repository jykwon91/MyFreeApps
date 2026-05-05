"""Tests for Turnstile fail-loud boot check (app/main.py:_check_turnstile_configured).

Covers:
- environment=production + empty key → RuntimeError raised
- environment=production + non-empty key → no error
- environment=development + empty key → no error (preserves dev/CI no-op)
- environment=test + empty key → no error (preserves CI no-op)
- environment=staging + empty key → RuntimeError raised (staging is non-dev)

Design mirrors test_observability.py: construct a settings-like namespace,
patch app.main.settings, then call _check_turnstile_configured() directly.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.main import _check_turnstile_configured


def _make_settings(*, environment: str, turnstile_secret_key: str) -> SimpleNamespace:
    """Return a settings-like namespace for patching app.main.settings."""
    return SimpleNamespace(environment=environment, turnstile_secret_key=turnstile_secret_key)


class TestTurnstileBootCheckProduction:
    """In production, a missing key must crash the process at boot."""

    def test_raises_when_production_and_key_empty(self) -> None:
        fake_settings = _make_settings(environment="production", turnstile_secret_key="")
        with patch("app.main.settings", fake_settings):
            with pytest.raises(RuntimeError, match="TURNSTILE_SECRET_KEY must be set"):
                _check_turnstile_configured()

    def test_does_not_raise_when_production_and_key_set(self) -> None:
        fake_settings = _make_settings(
            environment="production", turnstile_secret_key="real-secret-key-here"
        )
        with patch("app.main.settings", fake_settings):
            _check_turnstile_configured()  # must not raise

    def test_error_message_mentions_credential_stuffing(self) -> None:
        """The error message must explain WHY this is enforced — not just that it is."""
        fake_settings = _make_settings(environment="production", turnstile_secret_key="")
        with patch("app.main.settings", fake_settings):
            with pytest.raises(RuntimeError) as exc_info:
                _check_turnstile_configured()
        assert "credential-stuffing" in str(exc_info.value).lower()


class TestTurnstileBootCheckDevelopment:
    """In development/test, an empty key must be silently accepted."""

    @pytest.mark.parametrize("env", ["development", "test"])
    def test_does_not_raise_when_dev_or_test_and_key_empty(self, env: str) -> None:
        fake_settings = _make_settings(environment=env, turnstile_secret_key="")
        with patch("app.main.settings", fake_settings):
            _check_turnstile_configured()  # must not raise

    @pytest.mark.parametrize("env", ["development", "test"])
    def test_does_not_raise_when_dev_or_test_and_key_set(self, env: str) -> None:
        """Even if a key happens to be set in dev, it should not cause issues."""
        fake_settings = _make_settings(environment=env, turnstile_secret_key="some-key")
        with patch("app.main.settings", fake_settings):
            _check_turnstile_configured()  # must not raise


class TestTurnstileBootCheckNonDevEnvironments:
    """Environments other than development/test should also enforce the key."""

    @pytest.mark.parametrize("env", ["staging", "production", "prod", ""])
    def test_raises_for_non_dev_environments_without_key(self, env: str) -> None:
        fake_settings = _make_settings(environment=env, turnstile_secret_key="")
        with patch("app.main.settings", fake_settings):
            with pytest.raises(RuntimeError):
                _check_turnstile_configured()

    def test_does_not_raise_for_staging_with_key(self) -> None:
        fake_settings = _make_settings(environment="staging", turnstile_secret_key="staging-key")
        with patch("app.main.settings", fake_settings):
            _check_turnstile_configured()  # must not raise
