"""Unit tests for platform_shared.core.boot_guards."""

import pytest

from platform_shared.core.boot_guards import (
    TurnstileNotConfiguredError,
    check_turnstile_configured,
)


class TestCheckTurnstileConfigured:
    def test_dev_with_empty_key_passes(self) -> None:
        check_turnstile_configured(turnstile_secret_key="", environment="development")

    def test_test_with_empty_key_passes(self) -> None:
        check_turnstile_configured(turnstile_secret_key="", environment="test")

    def test_dev_with_set_key_passes(self) -> None:
        check_turnstile_configured(turnstile_secret_key="0xabc", environment="development")

    def test_production_with_empty_key_raises(self) -> None:
        with pytest.raises(TurnstileNotConfiguredError) as exc:
            check_turnstile_configured(turnstile_secret_key="", environment="production")
        assert "TURNSTILE_SECRET_KEY must be set" in str(exc.value)
        assert "credential-stuffing" in str(exc.value)

    def test_staging_with_empty_key_raises(self) -> None:
        with pytest.raises(TurnstileNotConfiguredError):
            check_turnstile_configured(turnstile_secret_key="", environment="staging")

    def test_unknown_environment_with_empty_key_raises(self) -> None:
        # Defensive: unknown environment names are treated as production
        with pytest.raises(TurnstileNotConfiguredError):
            check_turnstile_configured(turnstile_secret_key="", environment="canary")

    def test_production_with_set_key_passes(self) -> None:
        check_turnstile_configured(turnstile_secret_key="0xabc", environment="production")

    def test_inherits_from_runtime_error(self) -> None:
        assert issubclass(TurnstileNotConfiguredError, RuntimeError)
