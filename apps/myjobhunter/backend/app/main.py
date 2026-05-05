import logging
import os
import subprocess
import time
from datetime import datetime, timezone

import jwt
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt.exceptions import PyJWTError as JWTError

from platform_shared.core.lifespan import create_app_lifespan

from app.api import account, admin, applications, companies, documents, health, integrations, profile, resume_refinement, resumes, totp
from app.core.audit import current_user_id
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.observability import init_sentry
from app.core.rate_limit import (
    check_account_not_locked,
    check_login_rate_limit,
    require_turnstile,
)
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.storage.bucket_initializer import ensure_bucket


def _resolve_git_commit() -> str:
    """Resolve the deployed git commit short SHA.

    Mirrors apps/mybookkeeper/backend/app/main.py — used by the deploy
    workflow's freshness tripwire and by /api/version + /health for
    deploy verification.
    """
    env_commit = os.environ.get("GIT_COMMIT", "").strip()
    if env_commit:
        return env_commit
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


GIT_COMMIT = _resolve_git_commit()
STARTUP_TIMESTAMP = datetime.now(timezone.utc).isoformat()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("app")


lifespan = create_app_lifespan(
    settings=settings,
    init_sentry=init_sentry,
    bucket_init=ensure_bucket,
)


app = FastAPI(
    title="MyJobHunter API",
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

    Mirrors apps/mybookkeeper/backend/app/main.py — the access log is the
    primary triage surface in production, on top of Sentry. Without it,
    debugging a slow / 5xx endpoint requires `docker logs api` parsing.
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


# Auth routes — JWT login enforces email verification (returns
# detail="LOGIN_USER_NOT_VERIFIED" when an unverified user tries to log in)
# AND gates /login with the per-IP throttle + account-lockout (PR C3).
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

# Registration is gated behind Turnstile CAPTCHA (PR C1) — no-op when secret is empty.
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(require_turnstile)],
)

# Reset-password router exposes both /forgot-password and /reset-password.
# Only gate /forgot-password — /reset-password is protected by the email-link token.
_reset_router = fastapi_users.get_reset_password_router()
for _route in _reset_router.routes:
    if getattr(_route, "path", None) == "/forgot-password":
        _route.dependencies.append(Depends(require_turnstile))
app.include_router(
    _reset_router,
    prefix="/auth",
    tags=["auth"],
)

# Email verification routes (PR C4) — /auth/request-verify-token and /auth/verify
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)

# Register account self-service routes BEFORE fastapi-users users router so that
# DELETE /users/me is matched here rather than by fastapi-users' DELETE /users/{id}.
app.include_router(account.router)

app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)

# App routes
app.include_router(health.router, tags=["health"])
app.include_router(profile.router, tags=["profile"])
app.include_router(applications.router, tags=["applications"])
app.include_router(companies.router, tags=["companies"])
app.include_router(integrations.router, tags=["integrations"])
app.include_router(resumes.router, tags=["resumes"])
app.include_router(documents.router)
app.include_router(admin.router)
app.include_router(resume_refinement.router)

# TOTP routes — the /login subroute gets the per-IP throttle (matching the
# guard on /auth/jwt/login). Account lockout is enforced INSIDE
# UserManager.authenticate_password rather than as a route-level dependency,
# because check_account_not_locked consumes a form-encoded
# OAuth2PasswordRequestForm body and the TOTP login endpoint accepts JSON.
for _route in totp.router.routes:
    if getattr(_route, "path", None) == "/auth/totp/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
app.include_router(totp.router)

# Test-only helpers — mounted only when MYJOBHUNTER_ENABLE_TEST_HELPERS=1.
# Used by the E2E suite to put the DB into deterministic states (e.g.
# flipping `is_verified=True`). NEVER enable in production.
if os.environ.get("MYJOBHUNTER_ENABLE_TEST_HELPERS") == "1":
    from app.api import test_helpers

    app.include_router(test_helpers.router, tags=["_test"])


# Deploy verification — exposes the git commit + boot timestamp so the
# deploy workflow can confirm which commit is live without parsing logs.
# Mirrors apps/mybookkeeper/backend/app/main.py:/api/version. Note that
# this app uses ``root_path="/api"`` so the public path is /api/version.
@app.get("/version")
async def version() -> dict[str, str]:
    return {"commit": GIT_COMMIT, "timestamp": STARTUP_TIMESTAMP}
