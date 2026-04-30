import os
from contextlib import asynccontextmanager

import jwt
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt.exceptions import PyJWTError as JWTError

from app.api import applications, companies, health, integrations, profile
from app.core.audit import current_user_id, register_audit_listeners
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.rate_limit import (
    check_account_not_locked,
    check_login_rate_limit,
    require_turnstile,
)
from app.schemas.user import UserCreate, UserRead, UserUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_audit_listeners()
    yield


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
    """Populate ``current_user_id`` ContextVar from the request's JWT."""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return await call_next(request)
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            audience="fastapi-users:auth",
        )
    except JWTError:
        return await call_next(request)

    ctx_token = current_user_id.set(payload.get("sub"))
    try:
        return await call_next(request)
    finally:
        current_user_id.reset(ctx_token)


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

# Registration is gated behind Turnstile CAPTCHA — no-op in dev/CI.
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

# Test-only helpers — mounted only when MYJOBHUNTER_ENABLE_TEST_HELPERS=1.
# Used by the E2E suite to put the DB into deterministic states (e.g.
# flipping `is_verified=True`). NEVER enable in production.
if os.environ.get("MYJOBHUNTER_ENABLE_TEST_HELPERS") == "1":
    from app.api import test_helpers

    app.include_router(test_helpers.router, tags=["_test"])
