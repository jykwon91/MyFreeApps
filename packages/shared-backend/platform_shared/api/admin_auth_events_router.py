"""Shared GET /admin/auth-events route — security incident review tool.

Both MBK and MJH expose the same auth-events listing endpoint. Apps
build the router via ``build_admin_auth_events_router(...)`` passing
their own admin guard + db-session dependency, then include the
returned router in their existing admin router (or root app):

    from platform_shared.api.admin_auth_events_router import (
        build_admin_auth_events_router,
    )
    from app.core.permissions import current_admin
    from app.db.session import get_db

    router = APIRouter(prefix="/admin", tags=["admin"])
    router.include_router(
        build_admin_auth_events_router(
            admin_dependency=current_admin,
            get_db_dependency=get_db,
        ),
    )

The included router has no prefix of its own; the parent's ``/admin``
prefix is applied so the final path is ``GET /admin/auth-events``.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.auth_event_repo import list_filtered
from platform_shared.schemas.auth_event import AuthEventRead


def build_admin_auth_events_router(
    *,
    admin_dependency: Callable[..., object],
    get_db_dependency: Callable[..., AsyncIterator[AsyncSession]],
) -> APIRouter:
    """Build a router exposing ``GET /auth-events`` (admin-only).

    Args:
        admin_dependency: The app's admin-gate dependency (e.g.
            ``current_admin`` for MBK, ``current_superuser`` for MJH).
        get_db_dependency: The app's ``get_db`` async-generator
            dependency. The route uses it to read auth_events; never
            writes.

    Returns:
        An ``APIRouter`` with a single GET route. Tagged ``admin`` for
        OpenAPI grouping. No prefix — wire under the app's existing
        ``/admin`` parent router.
    """
    router = APIRouter(tags=["admin"])

    @router.get("/auth-events", response_model=list[AuthEventRead])
    async def list_auth_events(
        user_id: uuid.UUID | None = None,
        event_type: str | None = None,
        since: datetime | None = None,
        limit: int = Query(100, le=500),
        offset: int = 0,
        _admin: object = Depends(admin_dependency),
        db: AsyncSession = Depends(get_db_dependency),
    ) -> list[AuthEventRead]:
        """List auth events with optional filters, newest first.

        Operator-only endpoint for security incident review. All filters
        AND together. ``limit`` capped at 500 to avoid massive responses.
        """
        events = await list_filtered(
            db,
            user_id=user_id,
            event_type=event_type,
            since=since,
            limit=limit,
            offset=offset,
        )
        return [AuthEventRead.model_validate(e) for e in events]

    return router
