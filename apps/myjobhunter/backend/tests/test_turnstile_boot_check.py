"""Tests for the Turnstile boot-time configuration check.

Mirrors apps/mybookkeeper/backend/tests/test_silent_fail_audit_fixes.py
(boot-guard section) and the pattern from MBK PR #261.

The guard lives in platform_shared.core.boot_guards.check_turnstile_configured,
which is called by create_app_lifespan (platform_shared.core.lifespan) on every
app start. Tests here verify the guard logic in isolation — the lifespan
integration path is exercised by the MJH integration tests via app startup.

Environments tested:
  - "development" → guard is a no-op regardless of key
  - "test" → guard is a no-op regardless of key
  - "production" → raises when key is empty, passes when key is set
  - "staging" → raises when key is empty, passes when key is set
  - Any other string → treated as non-dev → raises when key is empty

This matches the semantics of _DEV_ENVIRONMENTS = ("development", "test")
in platform_shared.core.boot_guards.
"""
from __future__ import annotations

import pytest

from platform_shared.core.boot_guards import (
    TurnstileNotConfiguredError,
    check_turnstile_configured,
)


class TestCheckTurnstileConfigured:
    """Unit tests for check_turnstile_configured."""

    # ------------------------------------------------------------------
    # Dev / test environments — always a no-op
    # ------------------------------------------------------------------

    def test_development_empty_key_passes(self) -> None:
        """In 'development', an empty key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="",
            environment="development",
        )  # must not raise

    def test_development_set_key_passes(self) -> None:
        """In 'development', a non-empty key must not raise either."""
        check_turnstile_configured(
            turnstile_secret_key="0xABCDEF1234567890",
            environment="development",
        )

    def test_test_environment_empty_key_passes(self) -> None:
        """In 'test', an empty key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="",
            environment="test",
        )

    def test_test_environment_set_key_passes(self) -> None:
        """In 'test', a set key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="0xABCDEF1234567890",
            environment="test",
        )

    # ------------------------------------------------------------------
    # Production / staging — fail loud on empty key
    # ------------------------------------------------------------------

    def test_production_empty_key_raises(self) -> None:
        """In 'production', an empty key must raise TurnstileNotConfiguredError."""
        with pytest.raises(TurnstileNotConfiguredError):
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="production",
            )

    def test_production_set_key_passes(self) -> None:
        """In 'production', a non-empty key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="0xABCDEF1234567890",
            environment="production",
        )

    def test_staging_empty_key_raises(self) -> None:
        """In 'staging', an empty key must raise TurnstileNotConfiguredError."""
        with pytest.raises(TurnstileNotConfiguredError):
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="staging",
            )

    def test_staging_set_key_passes(self) -> None:
        """In 'staging', a non-empty key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="0xABCDEF1234567890",
            environment="staging",
        )

    # ------------------------------------------------------------------
    # Arbitrary non-dev environment names — treated as prod
    # ------------------------------------------------------------------

    def test_arbitrary_env_empty_key_raises(self) -> None:
        """Any unrecognised environment name with an empty key must raise."""
        with pytest.raises(TurnstileNotConfiguredError):
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="preview",
            )

    def test_arbitrary_env_set_key_passes(self) -> None:
        """Any unrecognised environment name with a set key must not raise."""
        check_turnstile_configured(
            turnstile_secret_key="0xABCDEF1234567890",
            environment="preview",
        )

    # ------------------------------------------------------------------
    # Error message content
    # ------------------------------------------------------------------

    def test_error_message_mentions_relevant_routes(self) -> None:
        """The RuntimeError message must mention the guarded auth routes so the
        operator knows which endpoints the CAPTCHA gate protects."""
        with pytest.raises(TurnstileNotConfiguredError) as exc_info:
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="production",
            )
        message = str(exc_info.value)
        # Both routes that require_turnstile guards in MJH's main.py
        assert "/auth/register" in message
        assert "/auth/forgot-password" in message

    def test_error_message_mentions_env_var(self) -> None:
        """The RuntimeError message must tell the operator which env var to set."""
        with pytest.raises(TurnstileNotConfiguredError) as exc_info:
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="production",
            )
        message = str(exc_info.value)
        assert "TURNSTILE_SECRET_KEY" in message

    def test_raises_subclass_of_runtime_error(self) -> None:
        """TurnstileNotConfiguredError must be a RuntimeError subclass so
        the lifespan context-manager propagates it and crashes the deploy."""
        with pytest.raises(RuntimeError):
            check_turnstile_configured(
                turnstile_secret_key="",
                environment="production",
            )
