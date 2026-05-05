"""FastAPI lifespan factory — Tier-1 platform extraction culmination.

The pre-extraction pattern: every app's main.py opened with a hand-rolled
asynccontextmanager that called the same boot guards in the same order:
init_sentry → check_turnstile → check_email → register_audit_listeners →
ensure_bucket → app-specific. This was the exact drift surface the
Tier-1 extraction series (PRs #290-#294) was built to remove — every
copy of the lifespan was an opportunity to forget a guard or run them
in the wrong order.

This factory composes the boot guards in the canonical order and lets
each app provide ONLY its app-specific bits via callable hooks. Apps'
main.py shrinks from ~30 lifespan lines to a single ``create_app_lifespan(...)``
call.

Boot order (rationale documented inline below):

  1. init_sentry()                — first, so any boot-guard failure
                                    is captured as a Sentry event
  2. check_turnstile_configured() — fail loud on missing CAPTCHA in prod
  3. check_email_configured()     — fail loud on missing SMTP creds /
                                    console mode in prod
  4. register_audit_listeners()   — wire SQLAlchemy listeners before any
                                    request handler can write
  5. bucket_init()                — verify MinIO reachable; refuse to
                                    boot if storage missing
  6. extra_startup()              — app-specific (e.g. MBK spawns the
                                    upload worker; MJH has nothing yet)
  7. yield                        — app handles requests
  8. extra_shutdown()             — app-specific cleanup (e.g. cancel
                                    the upload worker task)

Usage:

    from platform_shared.core.lifespan import create_app_lifespan

    from app.core.config import settings
    from app.services.storage.bucket_initializer import ensure_bucket

    lifespan = create_app_lifespan(
        settings=settings,
        bucket_init=ensure_bucket,
    )

    app = FastAPI(title="MyJobHunter API", lifespan=lifespan)

    # Or with app-specific startup/shutdown:
    async def _on_startup():
        ...

    async def _on_shutdown():
        ...

    lifespan = create_app_lifespan(
        settings=settings,
        bucket_init=ensure_bucket,
        on_startup=_on_startup,
        on_shutdown=_on_shutdown,
    )
"""
from __future__ import annotations

from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, Protocol

from fastapi import FastAPI

from platform_shared.core.audit import register_audit_listeners
from platform_shared.core.boot_guards import (
    check_email_configured,
    check_turnstile_configured,
)


class _SettingsProtocol(Protocol):
    """The Settings shape this factory needs.

    BaseAppSettings (and any subclass) satisfies this contract. Using
    a Protocol instead of a hard import keeps platform_shared.core.lifespan
    orthogonal to platform_shared.core.settings — the factory works with
    any object that exposes these fields.
    """

    sentry_dsn: str
    environment: str
    turnstile_secret_key: str
    email_backend: str
    smtp_user: str
    smtp_password: str


# init_sentry needs to be passed in as a callable rather than imported,
# because each app has a thin wrapper (app.core.observability) that
# binds settings.sentry_dsn / settings.environment internally — see
# PR #291. Apps pass that wrapper into the factory.
InitSentryFn = Callable[[], None]
BucketInitFn = Callable[[], None]
LifecycleHook = Callable[[], Awaitable[None] | None]


def create_app_lifespan(
    *,
    settings: _SettingsProtocol,
    init_sentry: InitSentryFn,
    bucket_init: BucketInitFn = lambda: None,
    on_startup: LifecycleHook | None = None,
    on_shutdown: LifecycleHook | None = None,
) -> Callable[[FastAPI], Any]:
    """Build a FastAPI lifespan asynccontextmanager that runs the canonical
    boot sequence + the app-provided hooks.

    Args:
        settings: An object exposing the BaseAppSettings shape — used to
            thread sentry_dsn, environment, turnstile_secret_key,
            email_backend, smtp_user, smtp_password through the boot
            guards.
        init_sentry: The app's wrapper around
            platform_shared.core.observability.init_sentry. Apps wire
            their own settings.sentry_dsn / settings.environment inside
            the wrapper so callers here don't need to thread them.
        bucket_init: Optional callable that verifies MinIO bucket
            existence at startup. Defaults to a no-op for apps that
            don't use object storage. Most apps pass their
            ``services.storage.bucket_initializer.ensure_bucket``.
        on_startup: Optional async or sync callable invoked AFTER all
            shared boot steps but BEFORE the lifespan yields. Use for
            app-specific work like spawning background tasks.
        on_shutdown: Optional async or sync callable invoked AFTER the
            lifespan yields. Use for app-specific cleanup.

    Returns:
        A callable that takes a FastAPI app and returns an async
        context manager — the shape FastAPI's ``lifespan=`` parameter
        expects.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        # 1. Sentry first — so any boot-guard failure below is
        #    captured as a Sentry event with the full traceback.
        init_sentry()

        # 2. Boot guards — fail loud in non-dev environments. Each
        #    raises a subclass of RuntimeError that crashes the
        #    lifespan, fails the healthcheck, and triggers a deploy
        #    rollback.
        check_turnstile_configured(
            turnstile_secret_key=settings.turnstile_secret_key,
            environment=settings.environment,
        )
        check_email_configured(
            email_backend=settings.email_backend,
            smtp_user=settings.smtp_user,
            smtp_password=settings.smtp_password,
            environment=settings.environment,
        )

        # 3. Side-effect inits — wire SQLAlchemy listeners before any
        #    request handler can run a write, and verify MinIO is
        #    reachable.
        register_audit_listeners()
        bucket_init()

        # 4. App-specific startup hook (workers, cron registration, etc.)
        if on_startup is not None:
            result = on_startup()
            if hasattr(result, "__await__"):
                await result  # type: ignore[misc]

        try:
            yield
        finally:
            # 5. App-specific shutdown hook
            if on_shutdown is not None:
                result = on_shutdown()
                if hasattr(result, "__await__"):
                    await result  # type: ignore[misc]

    return lifespan
