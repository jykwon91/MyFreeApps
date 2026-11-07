"""``GET /users/me`` on its own — the serve_only operator surface.

Serve-only prod signs the operator in for feature-request triage, and the
frontend reads ``/users/me`` to know who is signed in. Everything else the
fastapi-users users router carries (``PATCH /users/me``, ``/users/{id}``) is
full-auth only, so this keeps just the read.
"""
from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.auth import fastapi_users
from app.schemas.user.user_base import UserRead, UserUpdate

_CURRENT_USER_ROUTE = "users:current_user"


def _build_current_user_router() -> APIRouter:
    users_router = fastapi_users.get_users_router(UserRead, UserUpdate)
    router = APIRouter()
    router.routes = [
        route
        for route in users_router.routes
        if isinstance(route, APIRoute) and route.name == _CURRENT_USER_ROUTE
    ]
    if len(router.routes) != 1:
        raise RuntimeError(f"fastapi-users no longer names its GET /me route {_CURRENT_USER_ROUTE!r}")
    return router


router = _build_current_user_router()
