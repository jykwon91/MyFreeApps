import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.auth import auth_backend, fastapi_users
from app.core.config import settings
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

# Auth routes — JWT login enforces email verification (returns
# detail="LOGIN_USER_NOT_VERIFIED" when an unverified user tries to log in).
app.include_router(
    fastapi_users.get_auth_router(auth_backend, requires_verification=True),
    prefix="/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
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
