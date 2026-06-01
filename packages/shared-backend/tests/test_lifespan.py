"""Unit tests for platform_shared.core.lifespan.create_app_lifespan."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI

from platform_shared.core.boot_guards import (
    EmailNotConfiguredError,
    SmsNotConfiguredError,
    TransparencyNotConfiguredError,
    TurnstileNotConfiguredError,
)
from platform_shared.core.lifespan import create_app_lifespan


def _settings(
    *,
    environment: str = "development",
    sentry_dsn: str = "",
    turnstile_secret_key: str = "",
    email_backend: str = "console",
    smtp_user: str = "",
    smtp_password: str = "",
    sms_backend: str = "console",
    twilio_account_sid: str = "",
    twilio_auth_token: str = "",
    twilio_from_number: str = "",
    transparency_primary: bool = False,
    kofi_verification_token: str = "",
) -> SimpleNamespace:
    """Build a settings-like namespace for tests."""
    return SimpleNamespace(
        environment=environment,
        sentry_dsn=sentry_dsn,
        turnstile_secret_key=turnstile_secret_key,
        email_backend=email_backend,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        sms_backend=sms_backend,
        twilio_account_sid=twilio_account_sid,
        twilio_auth_token=twilio_auth_token,
        twilio_from_number=twilio_from_number,
        transparency_primary=transparency_primary,
        kofi_verification_token=kofi_verification_token,
    )


@pytest.fixture
def app() -> FastAPI:
    return FastAPI()


class TestBootSequenceOrder:
    """The factory must call boot steps in the canonical order."""

    @pytest.mark.asyncio
    async def test_calls_in_correct_order(self, app: FastAPI, monkeypatch) -> None:
        order: list[str] = []
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            lambda: order.append("audit"),
        )

        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=lambda: order.append("sentry"),
            bucket_init=lambda: order.append("bucket"),
            on_startup=lambda: order.append("startup"),
            on_shutdown=lambda: order.append("shutdown"),
        )

        async with lifespan(app):
            order.append("yielded")

        assert order == ["sentry", "audit", "bucket", "startup", "yielded", "shutdown"]


class TestBootGuardsRunWithSettings:
    """The factory must thread settings into the boot guards correctly."""

    @pytest.mark.asyncio
    async def test_production_with_no_turnstile_raises(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="",  # missing
                email_backend="smtp",
                smtp_user="x",
                smtp_password="y" * 16,
            ),
            init_sentry=MagicMock(),
        )
        with pytest.raises(TurnstileNotConfiguredError):
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_production_with_console_email_raises(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="console",
            ),
            init_sentry=MagicMock(),
        )
        with pytest.raises(EmailNotConfiguredError):
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_dev_environment_passes_with_empty_creds(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(environment="development"),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass


class TestSentryFirst:
    """init_sentry must run BEFORE the boot guards so guard failures get
    captured."""

    @pytest.mark.asyncio
    async def test_sentry_runs_before_turnstile_failure(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        sentry_called = []
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )

        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="",  # will raise
                email_backend="smtp",
                smtp_user="x",
                smtp_password="y" * 16,
            ),
            init_sentry=lambda: sentry_called.append("sentry"),
        )
        with pytest.raises(TurnstileNotConfiguredError):
            async with lifespan(app):
                pass
        assert sentry_called == ["sentry"]


class TestInitSentryOptional:
    """init_sentry defaults to None. Apps that opt out of Sentry (see
    _SENTRY_EXEMPT in tests/test_app_conformance.py) omit it entirely;
    the Sentry init is skipped without weakening the other boot guards.
    Mirrors the bucket_init default-noop opt-out shape."""

    @pytest.mark.asyncio
    async def test_omitted_init_sentry_boots_in_production(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        """A prod app with valid turnstile/email but NO init_sentry wired
        must boot cleanly — this is the MGA opt-out scenario."""
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="",  # no DSN, and init_sentry omitted below
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
            ),
            # init_sentry intentionally omitted (defaults to None)
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_opting_out_of_sentry_does_not_weaken_other_guards(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        """Omitting init_sentry must NOT skip the email/turnstile guards —
        a Sentry opt-out is not a license to boot misconfigured in prod."""
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                turnstile_secret_key="present",
                email_backend="console",  # invalid in prod → must raise
            ),
            # init_sentry omitted
        )
        with pytest.raises(EmailNotConfiguredError):
            async with lifespan(app):
                pass


class TestOptionalHooks:
    """on_startup and on_shutdown are optional; sync and async both supported."""

    @pytest.mark.asyncio
    async def test_no_hooks_provided(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_sync_startup_hook_runs(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        called = []
        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
            on_startup=lambda: called.append("startup"),
        )
        async with lifespan(app):
            pass
        assert called == ["startup"]

    @pytest.mark.asyncio
    async def test_async_startup_hook_runs(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        called = []

        async def _async_startup() -> None:
            called.append("async-startup")

        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
            on_startup=_async_startup,
        )
        async with lifespan(app):
            pass
        assert called == ["async-startup"]

    @pytest.mark.asyncio
    async def test_shutdown_runs_even_on_yield_exception(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        called = []
        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
            on_shutdown=lambda: called.append("shutdown"),
        )
        with pytest.raises(RuntimeError):
            async with lifespan(app):
                raise RuntimeError("boom")
        assert called == ["shutdown"]


class TestBucketInit:
    """bucket_init is optional but commonly provided."""

    @pytest.mark.asyncio
    async def test_default_bucket_init_is_noop(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        # No bucket_init provided — should not raise
        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_bucket_init_called(self, app: FastAPI, monkeypatch) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        bucket_called = []
        lifespan = create_app_lifespan(
            settings=_settings(),
            init_sentry=MagicMock(),
            bucket_init=lambda: bucket_called.append("bucket"),
        )
        async with lifespan(app):
            pass
        assert bucket_called == ["bucket"]


class TestSmsRequired:
    """sms_required=True gates the check_sms_configured guard."""

    @pytest.mark.asyncio
    async def test_default_sms_not_required_passes_in_prod_without_twilio(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        """Apps that never SMS (default) don't need Twilio creds even in prod."""
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
            ),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_sms_required_with_empty_twilio_creds_raises_in_prod(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
                sms_backend="twilio",
                # twilio creds intentionally empty
            ),
            init_sentry=MagicMock(),
            sms_required=True,
        )
        with pytest.raises(SmsNotConfiguredError):
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_sms_required_with_full_twilio_creds_passes(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
                sms_backend="twilio",
                twilio_account_sid="AC1",
                twilio_auth_token="t",
                twilio_from_number="+15551234567",
            ),
            init_sentry=MagicMock(),
            sms_required=True,
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_sms_required_in_dev_with_empty_creds_passes(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        """Dev/test envs don't need Twilio creds even with sms_required=True."""
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(environment="development"),
            init_sentry=MagicMock(),
            sms_required=True,
        )
        async with lifespan(app):
            pass


class TestTransparencyGuard:
    """The factory always runs check_transparency_configured; it self-gates so
    it only fails a misconfigured PRIMARY writer in a non-dev environment."""

    @pytest.mark.asyncio
    async def test_primary_without_kofi_token_raises_in_prod(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
                transparency_primary=True,
                kofi_verification_token="",  # missing → must raise
            ),
            init_sentry=MagicMock(),
        )
        with pytest.raises(TransparencyNotConfiguredError):
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_primary_with_kofi_token_passes_in_prod(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
                transparency_primary=True,
                kofi_verification_token="kofi-secret",
            ),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_non_primary_without_token_passes_in_prod(
        self, app: FastAPI, monkeypatch,
    ) -> None:
        """Read-only apps (default) never need the Ko-fi token."""
        monkeypatch.setattr(
            "platform_shared.core.lifespan.register_audit_listeners",
            MagicMock(),
        )
        lifespan = create_app_lifespan(
            settings=_settings(
                environment="production",
                sentry_dsn="https://x@y/1",
                turnstile_secret_key="present",
                email_backend="smtp",
                smtp_user="u",
                smtp_password="p" * 16,
                # transparency_primary defaults False
            ),
            init_sentry=MagicMock(),
        )
        async with lifespan(app):
            pass
