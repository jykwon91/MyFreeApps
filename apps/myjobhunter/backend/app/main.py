from contextlib import asynccontextmanager

import jwt
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt.exceptions import PyJWTError as JWTError

from app.api import applications, companies, health, integrations, profile
from app.core.audit import current_user_id, register_audit_listeners
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.rate_limit import check_account_not_locked, check_login_rate_limit
from app.schemas.user import UserCreate, UserRead, UserUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Attach the shared SQLAlchemy after_flush listener that writes audit_logs
    # rows for every INSERT/UPDATE/DELETE. Idempotent — safe across uvicorn
    # reloader restarts. PII masking + skip-tables are already registered at
    # import time via ``app.core.audit``.
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
    """Populate ``current_user_id`` ContextVar from the request's JWT.

    The audit listener reads this ContextVar to set ``audit_logs.changed_by``
    on every audited write. Anonymous requests (no/invalid token) leave it
    as ``None``, producing audit rows with ``changed_by=NULL``.
    """
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return await call_next(request)
    try:
        # fastapi-users JWTStrategy embeds ``aud: ["fastapi-users:auth"]`` in
        # every token. PyJWT rejects tokens containing an ``aud`` claim unless
        # ``audience`` is passed at decode time, so we must include it.
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


# Auth routes — gate ONLY the /login route with the per-IP throttle and the
# account-lockout dependency (PR C3). Both dependencies require an
# OAuth2PasswordRequestForm body, so attaching them to the entire
# get_auth_router() prefix would break /logout (which has no body).
_auth_router = fastapi_users.get_auth_router(auth_backend)
for _route in _auth_router.routes:
    if getattr(_route, "path", None) == "/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
        _route.dependencies.append(Depends(check_account_not_locked))

app.include_router(
    _auth_router,
    prefix="/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
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
