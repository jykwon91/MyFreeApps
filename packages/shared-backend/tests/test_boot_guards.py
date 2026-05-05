"""Unit tests for platform_shared.core.boot_guards."""

import pytest

from platform_shared.core.boot_guards import (
    EmailNotConfiguredError,
    TurnstileNotConfiguredError,
    check_email_configured,
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


class TestCheckEmailConfigured:
    def test_dev_with_console_passes(self) -> None:
        check_email_configured(
            email_backend="console",
            smtp_user="",
            smtp_password="",
            environment="development",
        )

    def test_test_with_console_passes(self) -> None:
        check_email_configured(
            email_backend="console",
            smtp_user="",
            smtp_password="",
            environment="test",
        )

    def test_dev_with_smtp_and_empty_creds_passes(self) -> None:
        check_email_configured(
            email_backend="smtp",
            smtp_user="",
            smtp_password="",
            environment="development",
        )

    def test_production_with_console_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="console",
                smtp_user="",
                smtp_password="",
                environment="production",
            )
        assert "console" in str(exc.value).lower()
        assert "verification" in str(exc.value).lower()

    def test_staging_with_console_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError):
            check_email_configured(
                email_backend="console",
                smtp_user="",
                smtp_password="",
                environment="staging",
            )

    def test_production_with_smtp_and_empty_user_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_user="",
                smtp_password="x" * 16,
                environment="production",
            )
        assert "SMTP_USER" in str(exc.value)

    def test_production_with_smtp_and_empty_password_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_user="user@example.com",
                smtp_password="",
                environment="production",
            )
        assert "SMTP_PASSWORD" in str(exc.value)

    def test_production_with_smtp_and_full_creds_passes(self) -> None:
        check_email_configured(
            email_backend="smtp",
            smtp_user="user@example.com",
            smtp_password="x" * 16,
            environment="production",
        )

    def test_inherits_from_runtime_error(self) -> None:
        assert issubclass(EmailNotConfiguredError, RuntimeError)
