"""Shared admin user-management router factory.

Each app calls ``build_admin_router(...)`` with its own ``current_admin``
dependency and an instantiated ``AdminUserService`` and mounts the
returned router. Routes:

    GET    /admin/users                       — list users
    PATCH  /admin/users/{id}/role             — change role
    PATCH  /admin/users/{id}/activate         — set is_active=true
    PATCH  /admin/users/{id}/deactivate       — set is_active=false
    PATCH  /admin/users/{id}/superuser        — toggle is_superuser
    GET    /admin/stats/users                 — user count summary

Apps remain free to mount additional admin endpoints under the same
``/admin`` prefix in their own routers (storage health, app-specific
stats, domain cleanups, etc.). FastAPI handles overlapping prefixes
across routers fine as long as paths don't collide.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from platform_shared.schemas.admin_user import (
    AdminUserRead,
    AdminUserRoleUpdate,
    UserStats,
)
from platform_shared.services.admin_user_service import AdminUserService


def build_admin_router(
    *,
    service: AdminUserService,
    current_admin: Callable[..., Any],
    response_model: type[Any] = AdminUserRead,
) -> APIRouter:
    """Construct the shared admin router.

    Args:
        service: The app's instance of ``AdminUserService`` (carries the
            User class + unit_of_work / session_factory).
        current_admin: The app's FastAPI dependency that yields a User
            after gating on ``Role.ADMIN``. Each app builds its own via
            ``platform_shared.core.permissions.require_role``.
        response_model: Optional override for the user response schema.
            Defaults to ``AdminUserRead``. Apps that want to return
            richer per-user fields can subclass it and pass the
            subclass here.

    Returns:
        A configured ``APIRouter`` ready to mount with
        ``app.include_router(router)``.
    """
    router = APIRouter(prefix="/admin", tags=["admin"])

    @router.get("/users", response_model=list[response_model])  # type: ignore[valid-type]
    async def list_users(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        admin: Any = Depends(current_admin),
    ) -> list[Any]:
        return list(await service.list_users(limit=limit, offset=offset))

    @router.patch(
        "/users/{user_id}/role", response_model=response_model,  # type: ignore[valid-type]
    )
    async def update_user_role(
        user_id: uuid.UUID,
        body: AdminUserRoleUpdate,
        admin: Any = Depends(current_admin),
    ) -> Any:
        try:
            return await service.update_user_role(user_id, body.role, admin)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch(
        "/users/{user_id}/activate", response_model=response_model,  # type: ignore[valid-type]
    )
    async def activate_user(
        user_id: uuid.UUID,
        admin: Any = Depends(current_admin),
    ) -> Any:
        try:
            return await service.activate_user(user_id, admin)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch(
        "/users/{user_id}/deactivate", response_model=response_model,  # type: ignore[valid-type]
    )
    async def deactivate_user(
        user_id: uuid.UUID,
        admin: Any = Depends(current_admin),
    ) -> Any:
        try:
            return await service.deactivate_user(user_id, admin)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch(
        "/users/{user_id}/superuser", response_model=response_model,  # type: ignore[valid-type]
    )
    async def toggle_superuser(
        user_id: uuid.UUID,
        admin: Any = Depends(current_admin),
    ) -> Any:
        try:
            return await service.toggle_superuser(user_id, admin)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.get("/stats/users", response_model=UserStats)
    async def get_user_stats(
        admin: Any = Depends(current_admin),
    ) -> UserStats:
        return await service.get_user_stats()

    return router
