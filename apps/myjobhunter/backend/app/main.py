from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import applications, companies, health, integrations, profile, totp
from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
from app.core.rate_limit import check_account_not_locked, check_login_rate_limit
from app.schemas.user import UserCreate, UserRead, UserUpdate


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

# TOTP routes — the /login subroute gets the same per-IP throttle + lockout
# guard wired onto the standard /auth/jwt/login route above. Without this,
# the 2FA login path would be a brute-force-friendlier hole than the
# password-only one.
for _route in totp.router.routes:
    if getattr(_route, "path", None) == "/auth/totp/login":
        _route.dependencies.append(Depends(check_login_rate_limit))
        _route.dependencies.append(Depends(check_account_not_locked))
app.include_router(totp.router)
