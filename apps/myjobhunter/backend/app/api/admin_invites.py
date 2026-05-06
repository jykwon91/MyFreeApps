"""Platform-level invite routes.

Two route groups in one file:

  * ``/admin/invites/*`` — admin-only (Role.ADMIN); CRUD on invites
  * ``/invites/{token}/*`` — public preview + authenticated accept

Layered architecture: routes are thin — every handler delegates to
``invite_service`` and translates the service's domain exceptions into
the appropriate HTTP status codes. No DB primitives in this file.

Status code conventions:
  * 201 — invite created
  * 200 — list / preview / accept
  * 204 — cancel
  * 400 — request shape problems / email mismatch on accept
  * 404 — invite not found
  * 409 — conflict (already-pending invite, already-registered user,
          already-accepted invite)
  * 410 — gone (expired)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from platform_shared.core.permissions import Role, require_role

from app.core.auth import current_active_user
from app.models.user.user import User
from app.schemas.platform.invite_accept_response import InviteAcceptResponse
from app.schemas.platform.invite_create_request import InviteCreateRequest
from app.schemas.platform.invite_info_response import InviteInfoResponse
from app.schemas.platform.invite_read import InviteRead
from app.services.platform import invite_service
from app.services.platform.invite_service import (
    InviteAlreadyAcceptedError,
    InviteAlreadyExistsError,
    InviteEmailMismatchError,
    InviteExpiredError,
    InviteNotFoundError,
    UserAlreadyRegisteredError,
)


# Pre-baked admin gate — built once and reused per route. Mirrors the
# pattern from app/api/admin.py exactly so a future RBAC tightening (e.g.
# adding a SUPER_ADMIN tier) only needs to change one factory call.
require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)


admin_router = APIRouter(prefix="/admin/invites", tags=["admin"])
public_router = APIRouter(prefix="/invites", tags=["invites"])


def _to_read(invite) -> InviteRead:  # type: ignore[no-untyped-def]
    """Project an ORM row + its computed status into the API schema."""
    return InviteRead(
        id=invite.id,
        email=invite.email,
        token=invite.token,
        status=invite_service.compute_status(invite),
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        accepted_by=invite.accepted_by,
        created_by=invite.created_by,
        created_at=invite.created_at,
    )


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------


@admin_router.post(
    "",
    response_model=InviteRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    body: InviteCreateRequest,
    admin: User = Depends(require_admin),
) -> InviteRead:
    try:
        invite = await invite_service.create_invite(
            email=body.email, admin_id=admin.id,
        )
    except UserAlreadyRegisteredError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except InviteAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _to_read(invite)


@admin_router.get("", response_model=list[InviteRead])
async def list_invites(
    admin: User = Depends(require_admin),
) -> list[InviteRead]:
    invites = await invite_service.list_pending_invites()
    return [_to_read(i) for i in invites]


@admin_router.delete(
    "/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(require_admin),
) -> None:
    try:
        await invite_service.cancel_invite(
            invite_id=invite_id, admin_id=admin.id,
        )
    except InviteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InviteAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ---------------------------------------------------------------------------
# Public preview + authenticated accept
# ---------------------------------------------------------------------------


@public_router.get("/{token}/info", response_model=InviteInfoResponse)
async def get_invite_info(token: str) -> InviteInfoResponse:
    """Public — no auth. Returns email + computed status + expires_at.

    Deliberately leaks no inviter identity / id / created_at — see
    ``InviteInfoResponse`` for the full reasoning.
    """
    try:
        invite, computed_status = await invite_service.get_invite_info(token)
    except InviteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return InviteInfoResponse(
        email=invite.email,
        status=computed_status,
        expires_at=invite.expires_at,
    )


@public_router.post(
    "/{token}/accept",
    response_model=InviteAcceptResponse,
    status_code=status.HTTP_200_OK,
)
async def accept_invite(
    token: str,
    user: User = Depends(current_active_user),
) -> InviteAcceptResponse:
    """Authenticated — the user must be logged in and verified.

    The invite's bound email must equal the calling user's email
    (case-insensitive). Returns the accepted invite id + accepted_at
    so the frontend can show a confirmation toast without an extra
    fetch.
    """
    try:
        invite = await invite_service.accept_invite(
            token=token, user_id=user.id, user_email=user.email,
        )
    except InviteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InviteExpiredError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except InviteAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except InviteEmailMismatchError as e:
        raise HTTPException(status_code=400, detail=str(e))
    assert invite.accepted_at is not None  # set by mark_accepted
    return InviteAcceptResponse(
        invite_id=invite.id,
        accepted_at=invite.accepted_at,
    )
