from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.rate_limit import require_turnstile
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.api import applications, companies, health, integrations, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
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

# Auth routes
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)

# Registration is gated behind Turnstile CAPTCHA — no-op in dev/CI when
# ``TURNSTILE_SECRET_KEY`` is empty.
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(require_turnstile)],
)

# Reset-password router exposes BOTH /forgot-password and /reset-password.
# We only gate /forgot-password — /reset-password is protected by the
# email-link token itself, matching MBK's policy.
_reset_router = fastapi_users.get_reset_password_router()
for _route in _reset_router.routes:
    if getattr(_route, "path", None) == "/forgot-password":
        _route.dependencies.append(Depends(require_turnstile))
app.include_router(
    _reset_router,
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
