"""Admin demo-management routes.

Every route here is gated by ``require_admin`` (platform-level admin
only). Demo accounts are an internal showcase tool — they MUST never
be reachable from a regular user session.

Routes:

  - ``POST /admin/demo/users`` — create a fully-seeded demo account,
    returns the credentials (email + plaintext password) ONCE.
  - ``GET /admin/demo/users`` — list all demo accounts with summary
    counts.
  - ``DELETE /admin/demo/users/{id}`` — delete a demo account and
    cascade every domain row they own. Refuses with 404 if the id
    refers to a real user (the repository enforces this at the SQL
    layer too).

Mirrors the MBK ``/admin/demo`` route shape with two divergences:
  1. No ``/reset`` endpoint — MJH's demo accounts are cheap to recreate
     (no tax-recompute step), so delete + create is simpler than reset.
  2. No invite-email sending — MJH's demo flow is operator-facing and
     the operator can hand-deliver credentials. SMTP wiring is also
     not required in MJH's prod env yet.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from platform_shared.core.permissions import Role, require_role

from app.core.auth import current_active_user
from app.models.user.user import User
from app.schemas.demo.demo import (
    DemoCreateRequest,
    DemoCreateResponse,
    DemoDeleteResponse,
    DemoUserListResponse,
)
from app.services.demo import demo_service


router = APIRouter(prefix="/admin/demo", tags=["admin", "demo"])

# Pre-bake the dependency once. The factory ``require_role`` needs the
# app's ``current_active_user`` to share the same fastapi-users wiring,
# so apps can't reuse a single global instance — each app builds its
# own admin gate. Mirrors ``app.api.admin.require_admin``.
require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)


@router.post("/users", response_model=DemoCreateResponse, status_code=201)
async def create_demo_user(
    body: DemoCreateRequest,
    _admin: User = Depends(require_admin),
) -> DemoCreateResponse:
    """Create a new fully-seeded demo account.

    Returns 201 with the freshly-generated credentials. The plaintext
    password is shown ONCE — the admin UI is responsible for
    surfacing it in a copy-button modal that warns the operator.
    """
    try:
        return await demo_service.create_demo_user(
            email=body.email, display_name=body.display_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/users", response_model=DemoUserListResponse)
async def list_demo_users(
    _admin: User = Depends(require_admin),
) -> DemoUserListResponse:
    """List every demo account with summary counts (newest first)."""
    return await demo_service.list_demo_users()


@router.delete(
    "/users/{user_id}", response_model=DemoDeleteResponse,
)
async def delete_demo_user(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
) -> DemoDeleteResponse:
    """Hard-delete a demo account and all cascade-able rows.

    Returns 404 if the id doesn't match an ``is_demo=True`` row —
    real accounts are not reachable from this endpoint by design.
    """
    try:
        return await demo_service.delete_demo_user(user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
