"""MyGamingAssistant FastAPI application.

Single-user app — the /register route is intentionally NOT mounted.
The operator account is seeded once at boot from SEED_USER_EMAIL +
SEED_USER_PASSWORD_HASH env vars (lifespan → _on_startup below).

Mirrors apps/myjobhunter/backend/app/main.py for all Tier-1 and Tier-2
patterns (lifespan factory, CORS, audit middleware, JWT login gating,
TOTP routes, admin router, version endpoint). MGA-specific divergences
are called out inline.
"""
import logging
import time
from datetime import datetime, timezone

import jwt
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt.exceptions import PyJWTError as JWTError

from platform_shared.core.git import resolve_git_commit
from platform_shared.core.lifespan import create_app_lifespan

from app.api import account, admin, games, health, lineups, lineup_packages, scheduler, sources, totp
# Note on lineups + lineup_packages routers:
# MGA uses public-read / auth-write — each of those modules exports two
# routers: ``public_router`` (no auth) and ``auth_router`` (operator only).
# See apps/mygamingassistant/CLAUDE.md → Authentication Model.
from app.core.audit import current_user_id
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.rate_limit import (
    check_account_not_locked,
    check_login_rate_limit,
    require_turnstile,
)
from app.schemas.user.user_base import UserCreate, UserRead, UserUpdate
from app.services.storage.bucket_initializer import ensure_bucket
from app.services.user.seed_user_service import (
    SeedUserInvalidEmailError,
    SeedUserNotConfiguredError,
    is_valid_seed_email,
    seed_operator_user,
)

GIT_COMMIT = resolve_git_commit()
STARTUP_TIMESTAMP = datetime.now(timezone.utc).isoformat()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("app")


class ClassifierNotConfiguredError(RuntimeError):
    """Raised at startup when ENABLE_CLASSIFIER=true but ANTHROPIC_API_KEY is missing."""


class SchedulerStartupError(RuntimeError):
    """Raised at startup when SCHEDULER_ENABLED=true but the scheduler fails to start."""


async def _on_startup() -> None:
    """MGA-specific startup: seed the single operator user + classifier boot guard.

    Boot guards:
      - production: SEED_USER_EMAIL + SEED_USER_PASSWORD_HASH required.
      - production: SEED_USER_EMAIL must be a valid email (fastapi-users
        serializes the operator via an EmailStr field; an invalid address
        makes GET /users/me 500 on every authenticated request).
      - production + ENABLE_CLASSIFIER=true: ANTHROPIC_API_KEY required.
      - development: missing/invalid vars log WARNING and seed/classifier
        are skipped.
    """
    email = settings.seed_user_email
    hashed_password = settings.seed_user_password_hash

    if not email or not hashed_password:
        if settings.environment == "production":
            raise SeedUserNotConfiguredError(
                "SEED_USER_EMAIL and SEED_USER_PASSWORD_HASH must be set in "
                "production. See apps/mygamingassistant/backend/.env.docker.example."
            )
        logger.warning(
            "_on_startup: SEED_USER_EMAIL or SEED_USER_PASSWORD_HASH is empty "
            "— skipping seed in non-production environment."
        )
        return

    # Email-format guard. fastapi-users' UserRead.email is EmailStr; seeding an
    # operator with an invalid address (e.g. dev@localhost — no dot in domain)
    # makes GET /users/me raise ResponseValidationError → 500 on every
    # authenticated request. Fail loud in prod; in dev, log loudly and skip the
    # seed rather than create a broken operator.
    if not is_valid_seed_email(email):
        if settings.environment == "production":
            raise SeedUserInvalidEmailError(
                f"SEED_USER_EMAIL={email!r} is not a valid email address. "
                "fastapi-users serializes the operator through an EmailStr "
                "field, so an invalid address makes GET /users/me return 500 "
                "on every authenticated request. Set a valid SEED_USER_EMAIL "
                "in apps/mygamingassistant/backend/.env.docker."
            )
        logger.error(
            "_on_startup: SEED_USER_EMAIL=%r is not a valid email address "
            "— skipping seed. GET /users/me would 500 for this operator. "
            "Set a valid SEED_USER_EMAIL (e.g. dev@example.com).",
            email,
        )
        return

    await seed_operator_user(email, hashed_password)

    # Classifier boot guard: fail loud in production if classifier is enabled
    # but ANTHROPIC_API_KEY is not set.
    if settings.enable_classifier and not settings.anthropic_api_key:
        if settings.environment == "production":
            raise ClassifierNotConfiguredError(
                "ENABLE_CLASSIFIER=true but ANTHROPIC_API_KEY is not set. "
                "Set ANTHROPIC_API_KEY in apps/mygamingassistant/backend/.env.docker "
                "or set ENABLE_CLASSIFIER=false to disable auto-classification."
            )
        logger.warning(
            "_on_startup: ENABLE_CLASSIFIER=true but ANTHROPIC_API_KEY is empty "
            "— classifier will log warnings and skip calls in non-production environment."
        )

    # Scheduler boot guard — start APScheduler if enabled.
    if settings.scheduler_enabled:
        from app.services.scheduling.scheduler_service import start_scheduler
        try:
            start_scheduler(sync_interval_hours=settings.source_sync_interval_hours)
            logger.info(
                "_on_startup: scheduler started — sync_interval_hours=%d",
                settings.source_sync_interval_hours,
            )
        except Exception as exc:
            if settings.environment == "production":
                raise SchedulerStartupError(
                    f"SCHEDULER_ENABLED=true but scheduler failed to start: {exc}. "
                    "Set SCHEDULER_ENABLED=false to disable the scheduler, or fix "
                    "the underlying error."
                ) from exc
            logger.warning(
                "_on_startup: SCHEDULER_ENABLED=true but scheduler failed to start "
                "(non-production — continuing): %s", str(exc),
            )
    else:
        logger.warning(
            "_on_startup: SCHEDULER_ENABLED=false — automatic source syncs are disabled. "
            "Use POST /api/scheduler/trigger/sync_all_sources for manual runs, or "
            "set SCHEDULER_ENABLED=true to re-enable.",
        )


async def _on_shutdown() -> None:
    """MGA-specific shutdown: stop the APScheduler."""
    if settings.scheduler_enabled:
        from app.services.scheduling.scheduler_service import shutdown_scheduler
        shutdown_scheduler()


lifespan = create_app_lifespan(
    settings=settings,
    bucket_init=ensure_bucket,
    on_startup=_on_startup,
    on_shutdown=_on_shutdown,
)


app = FastAPI(
    title="MyGamingAssistant API",
    lifespan=lifespan,
    root_path=settings.backend_root_path,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def set_audit_user(request: Request, call_next):
    """Populate ``current_user_id`` ContextVar from the request's JWT and
    emit a structured access log line for every request.

    Mirrors apps/myjobhunter/backend/app/main.py — the access log is the
    primary triage surface in production, on top of Sentry.
    """
    start = time.perf_counter()
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    user_id = None
    if token:
        try:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=["HS256"],
                audience="fastapi-users:auth",
            )
            user_id = payload.get("sub")
            ctx_token = current_user_id.set(user_id)
            try:
                response = await call_next(request)
            finally:
                current_user_id.reset(ctx_token)
        except JWTError:
            response = await call_next(request)
    else:
        response = await call_next(request)

    ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s %s %.0fms user=%s",
        request.method, request.url.path, response.status_code, ms, user_id or "anonymous",
    )
    if response.status_code >= 500:
        logger.error("5xx on %s %s", request.method, request.url.path)
    return response


# Auth routes — JWT login enforces email verification AND gates /login with
# the per-IP throttle + account-lockout.
_auth_router = fastapi_users.get_auth_router(auth_backend, requires_verification=True)
for _route in _auth_router.routes:
    if getattr(_route, "path", None) == "/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
        _route.dependencies.append(Depends(check_account_not_locked))

app.include_router(
    _auth_router,
    prefix="/auth/jwt",
    tags=["auth"],
)

# MGA is single-user — registration route is NOT mounted.
# The /auth/register endpoint is deliberately absent. The seed_operator_user
# service creates the operator account at boot time from env vars.

# Reset-password router — only /forgot-password gets Turnstile CAPTCHA.
# /reset-password is protected by the email-link token.
_reset_router = fastapi_users.get_reset_password_router()
for _route in _reset_router.routes:
    if getattr(_route, "path", None) == "/forgot-password":
        _route.dependencies.append(Depends(require_turnstile))
app.include_router(
    _reset_router,
    prefix="/auth",
    tags=["auth"],
)

# Email verification routes — /auth/request-verify-token and /auth/verify
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)

# Register account self-service routes BEFORE the fastapi-users users router
# so that DELETE /users/me is matched here rather than by fastapi-users'
# DELETE /users/{id}.
app.include_router(account.router)

app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)

# MGA domain routes.
# Public read surfaces are mounted first, followed by auth-gated routers.
# games + health are entirely public; lineups + lineup_packages split into
# (public read, auth write); sources + scheduler + admin stay auth-only.
app.include_router(health.router, tags=["health"])
app.include_router(games.router)
# games.auth_router handles operator-only minimap-upload endpoints under
# /api/maps/{map_id}/... — kept separate from games.router so auth gating is
# router-level, not per-handler.
app.include_router(games.auth_router)
# Auth-router includes literal-path routes (/lineups/pending, /lineups/bulk-accept)
# that would otherwise be shadowed by the public_router's /lineups/{lineup_id}
# parametric route. Include auth_router FIRST so the literal routes match before
# the parametric one. Same rationale for lineup_packages below.
app.include_router(lineups.auth_router)
app.include_router(lineups.public_router)
app.include_router(lineup_packages.auth_router)
app.include_router(lineup_packages.public_router)
app.include_router(sources.router)
app.include_router(scheduler.router)
app.include_router(admin.router)

# Shared platform admin router — generic user-management endpoints
# (list/role/activate/deactivate/superuser/stats-users).
from platform_shared.api.admin_router import build_admin_router
from app.core.permissions import current_admin, current_strict_superuser
from app.services.system.admin_user_service_factory import shared_admin_user_service


app.include_router(
    build_admin_router(
        service=shared_admin_user_service,
        current_admin=current_admin,
        current_strict_superuser=current_strict_superuser,
    )
)

# TOTP routes — /auth/totp/login gets the per-IP throttle.
for _route in totp.router.routes:
    if getattr(_route, "path", None) == "/auth/totp/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
app.include_router(totp.router)


# Test helpers — only mounted when MGA_ENABLE_TEST_HELPERS=1.
# Provides rate-limit reset + seed-lineup endpoints for E2E tests.
# Never set this flag in production.
if settings.mga_enable_test_helpers:
    from app.test_helpers.router import router as _test_helpers_router
    app.include_router(_test_helpers_router)

# Deploy verification — exposes the git commit + boot timestamp so the
# deploy workflow can confirm which commit is live without parsing logs.
# Note: this app uses ``root_path="/api"`` so the public path is /api/version.
@app.get("/version")
async def version() -> dict[str, str]:
    return {"commit": GIT_COMMIT, "timestamp": STARTUP_TIMESTAMP}
