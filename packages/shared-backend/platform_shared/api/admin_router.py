"""Shared admin user-management router factory.

Each app calls ``build_admin_router(...)`` with its own ``current_admin``
dependency, an instantiated ``AdminUserService``, and a ``step_up_verify``
callable, then mounts the returned router. Routes:

    GET    /admin/users                       — list users
    PATCH  /admin/users/{id}/role             — change role
    PATCH  /admin/users/{id}/activate         — set is_active=true
    PATCH  /admin/users/{id}/deactivate       — set is_active=false
    PATCH  /admin/users/{id}/superuser        — toggle is_superuser (TOTP step-up required)
    GET    /admin/stats/users                 — user count summary

Apps remain free to mount additional admin endpoints under the same
``/admin`` prefix in their own routers (storage health, app-specific
stats, domain cleanups, etc.). FastAPI handles overlapping prefixes
across routers fine as long as paths don't collide.

Step-up verification (PR fix/myjobhunter-superuser-totp-stepup):
The ``toggle_superuser`` endpoint requires a TOTP code in the request
body. The factory's ``step_up_verify`` callable is responsible for
checking the code against the calling admin's enrolled secret. This
keeps shared code free of TOTP-specific imports while letting each app
plug in its own verifier (e.g. MJH's ``verify_totp_code`` from
``app.services.user.totp_service``). A consumer that does NOT have TOTP
infrastructure cannot mount this router safely — by design, since the
audit flagged unconditional ``toggle_superuser`` flips as a Medium-
severity defect (a leaked admin session token grants permanent
superuser persistence).
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from platform_shared.schemas.admin_user import (
    AdminUserRead,
    AdminUserRoleUpdate,
    SuperuserToggleRequest,
    UserStats,
)
from platform_shared.services.admin_user_service import AdminUserService


StepUpVerifier = Callable[[Any, str], Awaitable[bool]]
"""Signature: ``(admin_user, totp_code) -> bool``.

Returns True when the code is valid for the given admin, False
otherwise. The router treats False as a 403 step-up failure.
"""


def build_admin_router(
    *,
    service: AdminUserService,
    current_admin: Callable[..., Any],
    step_up_verify: StepUpVerifier,
    response_model: type[Any] = AdminUserRead,
) -> APIRouter:
    """Construct the shared admin router.

    Args:
        service: The app's instance of ``AdminUserService`` (carries the
            User class + unit_of_work / session_factory).
        current_admin: The app's FastAPI dependency that yields a User
            after gating on ``Role.ADMIN`` / ``is_superuser``. Each app
            builds its own.
        step_up_verify: Callable that verifies a TOTP code against the
            calling admin's enrolled secret. REQUIRED — the router
            refuses to flip ``is_superuser`` without it.
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
        body: SuperuserToggleRequest,
        admin: Any = Depends(current_admin),
    ) -> Any:
        # Step-up gate: the highest-privilege op in the system requires
        # a fresh TOTP code, not just an active session token. Audit-flagged
        # 2026-05-06 — a leaked admin session token would otherwise grant
        # permanent superuser persistence.
        ok = await step_up_verify(admin, body.totp_code)
        if not ok:
            raise HTTPException(
                status_code=403,
                detail="step_up_failed",
            )
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
