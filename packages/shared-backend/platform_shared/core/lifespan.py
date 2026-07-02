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

  1. init_sentry()                — first (if wired), so any boot-guard
                                    failure is captured as a Sentry event.
                                    Optional — apps that don't need error
                                    monitoring omit it (see init_sentry arg)
  2. check_turnstile_configured() — fail loud on missing CAPTCHA in prod
  3. check_email_configured()     — fail loud on missing SMTP creds /
                                    console mode in prod
  4. register_audit_listeners()   — wire SQLAlchemy listeners before any
                                    request handler can write
  5. bucket_init()                — verify MinIO reachable; refuse to
                                    boot if storage missing
  6. seed_admin()                 — optional platform-admin seed for
                                    multi-user apps (see
                                    platform_shared.services.seed_admin_service);
                                    runs after register_audit_listeners
                                    so the seed's DB writes are audited
  7. extra_startup()              — app-specific (e.g. MBK spawns the
                                    upload worker; MJH has nothing yet)
  8. yield                        — app handles requests
  9. extra_shutdown()             — app-specific cleanup (e.g. cancel
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
    check_sms_configured,
    check_transparency_configured,
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
    sms_backend: str
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_from_number: str
    transparency_primary: bool
    kofi_verification_token: str


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
    init_sentry: InitSentryFn | None = None,
    bucket_init: BucketInitFn = lambda: None,
    turnstile_required: bool = True,
    email_required: bool = True,
    sms_required: bool = False,
    seed_admin: LifecycleHook | None = None,
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
        init_sentry: Optional. The app's wrapper around
            platform_shared.core.observability.init_sentry, binding its
            own settings.sentry_dsn / settings.environment internally so
            callers here don't thread them. Defaults to None — apps that
            don't need error monitoring (e.g. single-user casual apps)
            omit it and the Sentry init is skipped entirely. Mirrors the
            bucket_init opt-out shape; the SENTRY_EXEMPT allowlist in
            tests/test_app_conformance.py records which apps opt out.
        bucket_init: Optional callable that verifies MinIO bucket
            existence at startup. Defaults to a no-op for apps that
            don't use object storage. Most apps pass their
            ``services.storage.bucket_initializer.ensure_bucket``.
        turnstile_required: When True (default), the lifespan runs
            ``check_turnstile_configured()`` so the app fails loud in
            production if the CAPTCHA secret is missing. Set False for an
            app/mode that mounts no CAPTCHA-protected form (e.g. MGA's
            serve_only public-read deployment has no auth, so no
            forgot-password Turnstile widget). MBK / MJH leave this True.
        email_required: When True (default), the lifespan runs
            ``check_email_configured()`` so the app fails loud in
            production if SMTP creds are missing / console mode is set. Set
            False for an app/mode that sends no transactional email (e.g.
            MGA's serve_only deployment has no auth → no verify / reset /
            login email). MBK / MJH leave this True.
        sms_required: When True, the lifespan also runs
            ``check_sms_configured()`` so the app fails loud in
            production if Twilio credentials are missing. Apps that
            never text users (MBK, MJH) leave this False.
        seed_admin: Optional async or sync callable that seeds the
            platform-admin account for multi-user apps — build it with
            ``platform_shared.services.seed_admin_service.build_seed_admin_hook``.
            Runs AFTER ``register_audit_listeners`` (so the seed's DB
            writes are audited) and BEFORE ``on_startup``. Default None
            (single-user apps keep their own SEED_USER_* path; apps
            that never adopted the standard are unaffected).
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
        # 1. Sentry first (if the app wired it) — so any boot-guard
        #    failure below is captured as a Sentry event with the full
        #    traceback. Apps that don't need error monitoring (e.g.
        #    single-user casual apps) pass no init_sentry; skipped here.
        if init_sentry is not None:
            init_sentry()

        # 2. Boot guards — fail loud in non-dev environments. Each
        #    raises a subclass of RuntimeError that crashes the
        #    lifespan, fails the healthcheck, and triggers a deploy
        #    rollback.
        if turnstile_required:
            check_turnstile_configured(
                turnstile_secret_key=settings.turnstile_secret_key,
                environment=settings.environment,
            )
        if email_required:
            check_email_configured(
                email_backend=settings.email_backend,
                smtp_user=settings.smtp_user,
                smtp_password=settings.smtp_password,
                environment=settings.environment,
            )
        if sms_required:
            check_sms_configured(
                sms_backend=settings.sms_backend,
                twilio_account_sid=settings.twilio_account_sid,
                twilio_auth_token=settings.twilio_auth_token,
                twilio_from_number=settings.twilio_from_number,
                environment=settings.environment,
            )
        # Transparency writer guard — self-gating: a no-op unless this app is
        # the primary (the single Ko-fi webhook receiver) in a non-dev env.
        # Every app calls it; only a misconfigured primary fails to boot.
        check_transparency_configured(
            transparency_primary=settings.transparency_primary,
            kofi_verification_token=settings.kofi_verification_token,
            environment=settings.environment,
        )

        # 3. Side-effect inits — wire SQLAlchemy listeners before any
        #    request handler can run a write, and verify MinIO is
        #    reachable.
        register_audit_listeners()
        bucket_init()

        # 4. Platform-admin seed (multi-user apps) — after the audit
        #    listeners so the seed's own DB writes are audited, before
        #    the app-specific startup hook.
        if seed_admin is not None:
            result = seed_admin()
            if hasattr(result, "__await__"):
                await result  # type: ignore[misc]

        # 5. App-specific startup hook (workers, cron registration, etc.)
        if on_startup is not None:
            result = on_startup()
            if hasattr(result, "__await__"):
                await result  # type: ignore[misc]

        try:
            yield
        finally:
            # 6. App-specific shutdown hook
            if on_shutdown is not None:
                result = on_shutdown()
                if hasattr(result, "__await__"):
                    await result  # type: ignore[misc]

    return lifespan
