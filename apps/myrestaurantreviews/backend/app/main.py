from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.auth import auth_backend, fastapi_users
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.api import health


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="MyRestaurantReviews API",
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
