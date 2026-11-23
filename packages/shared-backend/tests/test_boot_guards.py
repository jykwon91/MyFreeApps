"""Unit tests for platform_shared.core.boot_guards."""

import re
import smtplib
from collections.abc import Callable

import pytest

from platform_shared.core.boot_guards import (
    EmailNotConfiguredError,
    ProductionTestModeError,
    SmsNotConfiguredError,
    TransparencyNotConfiguredError,
    TurnstileNotConfiguredError,
    check_email_configured,
    check_extraction_configured,
    check_sms_configured,
    check_test_mode_off,
    check_transparency_configured,
    check_transparency_sync_configured,
    check_turnstile_configured,
)
from platform_shared.core.observability import SentryNotConfiguredError, init_sentry
from platform_shared.core.settings import BaseAppSettings
from platform_shared.extraction.errors import ExtractionNotConfiguredError


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
            smtp_host="smtp.example.com",
            smtp_user="",
            smtp_password="",
            environment="development",
        )

    def test_test_with_console_passes(self) -> None:
        check_email_configured(
            email_backend="console",
            smtp_host="smtp.example.com",
            smtp_user="",
            smtp_password="",
            environment="test",
        )

    def test_dev_with_smtp_and_empty_creds_passes(self) -> None:
        check_email_configured(
            email_backend="smtp",
            smtp_host="smtp.example.com",
            smtp_user="",
            smtp_password="",
            environment="development",
        )

    def test_production_with_console_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="console",
                smtp_host="smtp.example.com",
                smtp_user="",
                smtp_password="",
                environment="production",
            )
        message = str(exc.value)
        assert "console" in message.lower()
        assert "verification" in message.lower()
        assert "SMTP_HOST" in message and "SMTP_USER" in message and "SMTP_PASSWORD" in message

    def test_staging_with_console_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError):
            check_email_configured(
                email_backend="console",
                smtp_host="smtp.example.com",
                smtp_user="",
                smtp_password="",
                environment="staging",
            )

    def test_production_with_smtp_and_empty_user_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_host="smtp.example.com",
                smtp_user="",
                smtp_password="x" * 16,
                environment="production",
            )
        message = str(exc.value)
        assert "Not set: SMTP_USER." in message
        assert "SMTP_HOST" not in message and "SMTP_PASSWORD" not in message

    def test_production_with_smtp_and_empty_password_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_host="smtp.example.com",
                smtp_user="user@example.com",
                smtp_password="",
                environment="production",
            )
        message = str(exc.value)
        assert "Not set: SMTP_PASSWORD." in message
        assert "SMTP_HOST" not in message and "SMTP_USER" not in message

    def test_production_with_smtp_and_full_creds_passes(self) -> None:
        check_email_configured(
            email_backend="smtp",
            smtp_host="smtp.example.com",
            smtp_user="user@example.com",
            smtp_password="x" * 16,
            environment="production",
        )

    def test_production_with_smtp_and_empty_host_raises(self) -> None:
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_host="",
                smtp_user="user@example.com",
                smtp_password="x" * 16,
                environment="production",
            )
        message = str(exc.value)
        assert "Not set: SMTP_HOST." in message
        assert "SMTP_USER" not in message and "SMTP_PASSWORD" not in message

    @pytest.mark.parametrize(
        ("smtp_user", "smtp_password", "named", "not_named"),
        [
            pytest.param(
                "user-SENTINEL@example.com", "p\u00e4ss-SENTINEL", ["SMTP_PASSWORD"], ["SMTP_USER"],
                id="password",
            ),
            pytest.param(
                "j\u00f6rg-SENTINEL@example.com", "ascii-SENTINEL-pw", ["SMTP_USER"], ["SMTP_PASSWORD"],
                id="user",
            ),
            pytest.param(
                "j\u00f6rg-SENTINEL@example.com", "p\u00e4ss-SENTINEL", ["SMTP_USER", "SMTP_PASSWORD"], [],
                id="both",
            ),
        ],
    )
    @pytest.mark.parametrize("environment", ["production", "staging"])
    def test_non_dev_with_smtp_and_non_ascii_creds_raises(
        self,
        smtp_user: str,
        smtp_password: str,
        named: list[str],
        not_named: list[str],
        environment: str,
    ) -> None:
        """smtplib can't log in with them, so every send would fail."""
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_host="smtp.example.com",
                smtp_user=smtp_user,
                smtp_password=smtp_password,
                environment=environment,
            )
        message = str(exc.value)
        assert all(name in message for name in named)
        assert not any(name in message for name in not_named)
        # The message names the setting, never its value or a character of it.
        assert message.isascii()
        assert "SENTINEL" not in message
        assert "\\x" not in message and "\\u" not in message
        assert "position" not in message

    @pytest.mark.parametrize(
        ("smtp_host", "smtp_user", "smtp_password", "expected", "not_named"),
        [
            pytest.param(
                "smtp.example.com", "", "p\u00e4ss-SENTINEL",
                ["Not set: SMTP_USER.", "Not ASCII: SMTP_PASSWORD."], ["SMTP_HOST"],
                id="user-empty-password-not-ascii",
            ),
            pytest.param(
                "", "j\u00f6rg-SENTINEL@example.com", "",
                ["Not set: SMTP_HOST, SMTP_PASSWORD.", "Not ASCII: SMTP_USER."], [],
                id="host-and-password-empty-user-not-ascii",
            ),
            pytest.param(
                "", "", "", ["Not set: SMTP_HOST, SMTP_USER, SMTP_PASSWORD."], ["Not ASCII"],
                id="all-empty",
            ),
        ],
    )
    def test_production_with_smtp_names_every_setting_at_fault(
        self,
        smtp_host: str,
        smtp_user: str,
        smtp_password: str,
        expected: list[str],
        not_named: list[str],
    ) -> None:
        """One failed deploy shows every fix, not one fix per failed deploy."""
        with pytest.raises(EmailNotConfiguredError) as exc:
            check_email_configured(
                email_backend="smtp",
                smtp_host=smtp_host,
                smtp_user=smtp_user,
                smtp_password=smtp_password,
                environment="production",
            )
        message = str(exc.value)
        assert all(part in message for part in expected)
        assert not any(part in message for part in not_named)
        assert message.isascii()
        assert "SENTINEL" not in message

    @pytest.mark.parametrize("environment", ["development", "test"])
    def test_dev_with_smtp_and_non_ascii_creds_passes(self, environment: str) -> None:
        check_email_configured(
            email_backend="smtp",
            smtp_host="smtp.example.com",
            smtp_user="j\u00f6rg@example.com",
            smtp_password="p\u00e4ssword-not-real",
            environment=environment,
        )

    def test_smtplib_still_sends_the_login_as_ascii(self) -> None:
        """Why the ASCII rule exists. If this fails, smtplib accepts a non-ASCII
        login: drop the rule from check_email_configured."""
        # No host, so it never connects; a local name, so it never looks one up.
        smtp = smtplib.SMTP(local_hostname="localhost")
        smtp.user, smtp.password = "user@example.com", "p\u00e4ss"
        with pytest.raises(UnicodeEncodeError):
            smtp.auth("PLAIN", smtp.auth_plain)

    def test_inherits_from_runtime_error(self) -> None:
        assert issubclass(EmailNotConfiguredError, RuntimeError)


class TestCheckSmsConfigured:
    def test_dev_with_console_passes(self) -> None:
        check_sms_configured(
            sms_backend="console",
            twilio_account_sid="",
            twilio_auth_token="",
            twilio_from_number="",
            environment="development",
        )

    def test_test_with_console_passes(self) -> None:
        check_sms_configured(
            sms_backend="console",
            twilio_account_sid="",
            twilio_auth_token="",
            twilio_from_number="",
            environment="test",
        )

    def test_dev_with_twilio_and_empty_creds_passes(self) -> None:
        check_sms_configured(
            sms_backend="twilio",
            twilio_account_sid="",
            twilio_auth_token="",
            twilio_from_number="",
            environment="development",
        )

    def test_production_with_console_raises(self) -> None:
        with pytest.raises(SmsNotConfiguredError) as exc:
            check_sms_configured(
                sms_backend="console",
                twilio_account_sid="",
                twilio_auth_token="",
                twilio_from_number="",
                environment="production",
            )
        assert "console" in str(exc.value).lower()
        assert "TWILIO_" in str(exc.value)

    def test_staging_with_console_raises(self) -> None:
        with pytest.raises(SmsNotConfiguredError):
            check_sms_configured(
                sms_backend="console",
                twilio_account_sid="",
                twilio_auth_token="",
                twilio_from_number="",
                environment="staging",
            )

    def test_production_with_twilio_and_missing_sid_raises(self) -> None:
        with pytest.raises(SmsNotConfiguredError) as exc:
            check_sms_configured(
                sms_backend="twilio",
                twilio_account_sid="",
                twilio_auth_token="t",
                twilio_from_number="+15551234567",
                environment="production",
            )
        assert "TWILIO_ACCOUNT_SID" in str(exc.value)

    def test_production_with_twilio_and_missing_token_raises(self) -> None:
        with pytest.raises(SmsNotConfiguredError):
            check_sms_configured(
                sms_backend="twilio",
                twilio_account_sid="AC1",
                twilio_auth_token="",
                twilio_from_number="+15551234567",
                environment="production",
            )

    def test_production_with_twilio_and_missing_from_number_raises(self) -> None:
        with pytest.raises(SmsNotConfiguredError):
            check_sms_configured(
                sms_backend="twilio",
                twilio_account_sid="AC1",
                twilio_auth_token="t",
                twilio_from_number="",
                environment="production",
            )

    def test_production_with_twilio_and_full_creds_passes(self) -> None:
        check_sms_configured(
            sms_backend="twilio",
            twilio_account_sid="AC1",
            twilio_auth_token="t",
            twilio_from_number="+15551234567",
            environment="production",
        )

    def test_production_with_an_unknown_backend_raises(self) -> None:
        """A backend left over from a removed provider must not boot as "texts off"."""
        with pytest.raises(SmsNotConfiguredError) as exc:
            check_sms_configured(
                sms_backend="httpsms",
                twilio_account_sid="",
                twilio_auth_token="",
                twilio_from_number="",
                environment="production",
                console_allowed=True,
            )
        assert "'httpsms'" in str(exc.value)
        assert "SMS_BACKEND=console" in str(exc.value)

    def test_dev_with_an_unknown_backend_passes(self) -> None:
        check_sms_configured(
            sms_backend="httpsms",
            twilio_account_sid="",
            twilio_auth_token="",
            twilio_from_number="",
            environment="development",
        )

    def test_production_with_console_passes_when_texts_are_optional(self) -> None:
        check_sms_configured(
            sms_backend="console",
            twilio_account_sid="",
            twilio_auth_token="",
            twilio_from_number="",
            environment="production",
            console_allowed=True,
        )

    def test_optional_texts_still_need_every_twilio_credential(self) -> None:
        with pytest.raises(SmsNotConfiguredError) as exc:
            check_sms_configured(
                sms_backend="twilio",
                twilio_account_sid="AC1",
                twilio_auth_token="",
                twilio_from_number="+15551234567",
                environment="production",
                console_allowed=True,
            )
        assert "TWILIO_AUTH_TOKEN" in str(exc.value)

    def test_inherits_from_runtime_error(self) -> None:
        assert issubclass(SmsNotConfiguredError, RuntimeError)


class TestCheckTransparencyConfigured:
    def test_dev_primary_empty_token_passes(self) -> None:
        check_transparency_configured(
            transparency_primary=True,
            kofi_verification_token="",
            environment="development",
        )

    def test_test_primary_empty_token_passes(self) -> None:
        check_transparency_configured(
            transparency_primary=True,
            kofi_verification_token="",
            environment="test",
        )

    def test_non_primary_empty_token_passes_in_prod(self) -> None:
        """Read-only apps need no token even in production."""
        check_transparency_configured(
            transparency_primary=False,
            kofi_verification_token="",
            environment="production",
        )

    def test_primary_with_token_passes_in_prod(self) -> None:
        check_transparency_configured(
            transparency_primary=True,
            kofi_verification_token="kofi-secret",
            environment="production",
        )

    def test_primary_empty_token_raises_in_prod(self) -> None:
        with pytest.raises(TransparencyNotConfiguredError) as exc:
            check_transparency_configured(
                transparency_primary=True,
                kofi_verification_token="",
                environment="production",
            )
        assert "KOFI_VERIFICATION_TOKEN" in str(exc.value)
        assert "TRANSPARENCY_PRIMARY" in str(exc.value)

    def test_primary_empty_token_raises_in_staging(self) -> None:
        with pytest.raises(TransparencyNotConfiguredError):
            check_transparency_configured(
                transparency_primary=True,
                kofi_verification_token="",
                environment="staging",
            )

    def test_inherits_from_runtime_error(self) -> None:
        assert issubclass(TransparencyNotConfiguredError, RuntimeError)


def _sync_guard(
    *,
    environment: str = "production",
    transparency_primary: bool = True,
    minio_endpoint: str = "myfreeapps-minio:9000",
    minio_access_key: str = "access",
    minio_secret_key: str = "secret",
    transparency_shared_bucket: str = "myfreeapps-shared",
) -> None:
    check_transparency_sync_configured(
        transparency_primary=transparency_primary,
        minio_endpoint=minio_endpoint,
        minio_access_key=minio_access_key,
        minio_secret_key=minio_secret_key,
        transparency_shared_bucket=transparency_shared_bucket,
        environment=environment,
    )


class TestCheckTransparencySyncConfigured:
    def test_primary_fully_configured_passes_in_prod(self) -> None:
        _sync_guard()

    @pytest.mark.parametrize("environment", ["development", "test"])
    def test_dev_and_test_pass_with_empty_storage(self, environment: str) -> None:
        _sync_guard(environment=environment, minio_endpoint="", minio_access_key="")

    def test_non_primary_passes_with_empty_storage_in_prod(self) -> None:
        _sync_guard(transparency_primary=False, minio_endpoint="", minio_secret_key="")

    @pytest.mark.parametrize(
        ("field", "env_name"),
        [
            ("minio_endpoint", "MINIO_ENDPOINT"),
            ("minio_access_key", "MINIO_ACCESS_KEY"),
            ("minio_secret_key", "MINIO_SECRET_KEY"),
            ("transparency_shared_bucket", "TRANSPARENCY_SHARED_BUCKET"),
        ],
    )
    def test_primary_missing_field_raises_naming_it(self, field: str, env_name: str) -> None:
        with pytest.raises(TransparencyNotConfiguredError) as exc:
            _sync_guard(**{field: ""})
        assert env_name in str(exc.value)
        assert "TRANSPARENCY_PRIMARY" in str(exc.value)

    def test_raises_in_staging(self) -> None:
        with pytest.raises(TransparencyNotConfiguredError):
            _sync_guard(environment="staging", minio_access_key="")


def _required_settings() -> BaseAppSettings:
    return BaseAppSettings(
        _env_file=None,
        database_url="sqlite+aiosqlite:///:memory:",
        database_url_sync="sqlite:///:memory:",
        secret_key="x" * 32,
        encryption_key="y" * 32,
    )


class TestCheckTestModeOff:
    @pytest.mark.parametrize("environment", ["development", "test"])
    def test_allowed_where_tests_run_when_explicit(self, environment: str) -> None:
        check_test_mode_off(
            flag_name="MY_FLAG", flag_is_on=True, environment=environment, environment_is_explicit=True,
        )

    @pytest.mark.parametrize("explicit", [True, False])
    @pytest.mark.parametrize("environment", ["development", "test", "production", "staging"])
    def test_off_passes_everywhere(self, environment: str, explicit: bool) -> None:
        check_test_mode_off(
            flag_name="MY_FLAG", flag_is_on=False, environment=environment, environment_is_explicit=explicit,
        )

    @pytest.mark.parametrize("environment", ["production", "staging"])
    def test_on_outside_development_and_test_raises(self, environment: str) -> None:
        with pytest.raises(ProductionTestModeError, match="MY_FLAG"):
            check_test_mode_off(
                flag_name="MY_FLAG", flag_is_on=True, environment=environment, environment_is_explicit=True,
            )

    def test_on_with_defaulted_environment_raises(self) -> None:
        with pytest.raises(ProductionTestModeError, match="explicitly"):
            check_test_mode_off(
                flag_name="MY_FLAG", flag_is_on=True, environment="development", environment_is_explicit=False,
            )

    def test_defaulted_environment_setting_is_not_explicit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        assert _required_settings().environment_is_explicit is False

    def test_environment_from_env_var_is_explicit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ENVIRONMENT", "test")
        assert _required_settings().environment_is_explicit is True


# "ENVIRONMENT=development", "ENVIRONMENT to 'development'" and the like.
_SWITCH_TO_DEV = re.compile(r"ENVIRONMENT\s*(=|to)\s*['\"]?(development|test)", re.IGNORECASE)
_SMS_UNSET = {"twilio_account_sid": "", "twilio_auth_token": "", "twilio_from_number": ""}


@pytest.mark.parametrize(
    ("error", "guard"),
    [
        (TurnstileNotConfiguredError, lambda: check_turnstile_configured(
            turnstile_secret_key="", environment="production")),
        (SmsNotConfiguredError, lambda: check_sms_configured(
            sms_backend="console", environment="production", **_SMS_UNSET)),
        (SmsNotConfiguredError, lambda: check_sms_configured(
            sms_backend="twilio", environment="production", **_SMS_UNSET)),
        (SmsNotConfiguredError, lambda: check_sms_configured(
            sms_backend="httpsms", environment="production", **_SMS_UNSET)),
        (TransparencyNotConfiguredError, lambda: check_transparency_configured(
            transparency_primary=True, kofi_verification_token="", environment="production")),
        (TransparencyNotConfiguredError, lambda: check_transparency_sync_configured(
            transparency_primary=True, minio_endpoint="", minio_access_key="",
            minio_secret_key="", transparency_shared_bucket="", environment="production")),
        (ExtractionNotConfiguredError, lambda: check_extraction_configured(
            anthropic_api_key="", environment="production")),
        (SentryNotConfiguredError, lambda: init_sentry(dsn="", environment="production")),
    ],
    ids=[
        "turnstile", "sms_console", "sms_twilio", "sms_unknown_backend", "kofi",
        "transparency_sync", "extraction", "sentry",
    ],
)
def test_a_production_refusal_never_suggests_switching_to_development(
    error: type[Exception], guard: Callable[[], None],
) -> None:
    """Setting ENVIRONMENT=development on the server would switch every boot
    guard off, so no refusal may offer it as the fix."""
    with pytest.raises(error) as raised:
        guard()
    assert not _SWITCH_TO_DEV.search(str(raised.value))
