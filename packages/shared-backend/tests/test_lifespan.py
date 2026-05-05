"""Unit tests for platform_shared.core.lifespan.create_app_lifespan."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI

from platform_shared.core.boot_guards import (
    EmailNotConfiguredError,
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
) -> SimpleNamespace:
    """Build a settings-like namespace for tests."""
    return SimpleNamespace(
        environment=environment,
        sentry_dsn=sentry_dsn,
        turnstile_secret_key=turnstile_secret_key,
        email_backend=email_backend,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
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
