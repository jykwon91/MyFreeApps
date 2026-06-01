"""__APP_DISPLAY_NAME__ FastAPI application.

Single-user app -- the /register route is intentionally NOT mounted.
The operator account is seeded once at boot from SEED_USER_EMAIL +
SEED_USER_PASSWORD_HASH env vars (lifespan -> _on_startup below).

Mirrors apps/myjobhunter/backend/app/main.py for all Tier-1 and Tier-2
patterns (lifespan factory, CORS, audit middleware, JWT login gating,
TOTP routes, admin router, version endpoint).
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
from platform_shared.api.transparency_router import build_transparency_router

from app.api import account, admin, health, totp
from app.core.audit import current_user_id
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.observability import init_sentry
from app.core.rate_limit import (
    check_account_not_locked,
    check_login_rate_limit,
    require_turnstile,
)
from app.schemas.user.user_base import UserCreate, UserRead, UserUpdate  # noqa: F401
from app.services.storage.bucket_initializer import ensure_bucket
from app.services.user.seed_user_service import (
    SeedUserNotConfiguredError,
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


async def _on_startup() -> None:
    """Seed the single operator user.

    Boot guards:
      - production: SEED_USER_EMAIL + SEED_USER_PASSWORD_HASH required.
      - development: missing vars log WARNING and seed is skipped.
    """
    email = settings.seed_user_email
    hashed_password = settings.seed_user_password_hash

    if not email or not hashed_password:
        if settings.environment == "production":
            raise SeedUserNotConfiguredError(
                "SEED_USER_EMAIL and SEED_USER_PASSWORD_HASH must be set in "
                "production. See apps/__APP_SLUG__/backend/.env.docker.example."
            )
        logger.warning(
            "_on_startup: SEED_USER_EMAIL or SEED_USER_PASSWORD_HASH is empty "
            "-- skipping seed in non-production environment."
        )
        return

    await seed_operator_user(email, hashed_password)


lifespan = create_app_lifespan(
    settings=settings,
    init_sentry=init_sentry,
    bucket_init=ensure_bucket,
    on_startup=_on_startup,
)


app = FastAPI(
    title="__APP_DISPLAY_NAME__ API",
    lifespan=lifespan,
    root_path="/api",
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


# Auth routes -- JWT login enforces email verification AND gates /login with
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

# Single-user -- registration route is NOT mounted.
# The /auth/register endpoint is deliberately absent. The seed_operator_user
# service creates the operator account at boot time from env vars.

# Reset-password router -- only /forgot-password gets Turnstile CAPTCHA.
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

# Email verification routes -- /auth/request-verify-token and /auth/verify
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

# Platform health + app admin routes
app.include_router(health.router, tags=["health"])
app.include_router(admin.router)

# Shared platform admin router -- generic user-management endpoints
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

# Public transparency / support endpoints (shared): GET /transparency +
# POST /donations/kofi-webhook. Unauthenticated by design — the public
# /support page reads it, and Ko-fi posts donations to the one primary app
# (the app with kofi_verification_token set; every other app 404s the
# webhook). Resource-level paths; host Caddy strips the /api prefix.
app.include_router(build_transparency_router(settings))

# TOTP routes -- /auth/totp/login gets the per-IP throttle.
for _route in totp.router.routes:
    if getattr(_route, "path", None) == "/auth/totp/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
app.include_router(totp.router)


# Test helpers -- only mounted when APP_ENABLE_TEST_HELPERS=1.
# Provides rate-limit reset for E2E tests.
# Never set this flag in production.
if settings.app_enable_test_helpers:
    from app.test_helpers.router import router as _test_helpers_router
    app.include_router(_test_helpers_router)

# Deploy verification -- exposes the git commit + boot timestamp so the
# deploy workflow can confirm which commit is live without parsing logs.
# Note: this app uses ``root_path="/api"`` so the public path is /api/version.
@app.get("/version")
async def version() -> dict[str, str]:
    return {"commit": GIT_COMMIT, "timestamp": STARTUP_TIMESTAMP}
