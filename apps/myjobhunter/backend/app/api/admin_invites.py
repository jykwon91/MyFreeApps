"""Platform-level invite routes.

Two route groups in one file:

  * ``/admin/invites/*`` — superuser-only; CRUD on invites
  * ``/invites/{token}/*`` — public preview + authenticated accept

Layered architecture: routes are thin — every handler delegates to
``invite_service`` and translates the service's domain exceptions into
the appropriate HTTP status codes. No DB primitives in this file.

Security shape (2026-05-05): the public ``GET /invites/{token}/info``
endpoint is per-IP rate-limited so an attacker cannot use it as a
free token-validity oracle. The 409-collision response on
``POST /admin/invites`` returns a single generic body so even a
compromised admin token cannot enumerate existing user accounts vs.
in-flight invites.

Status code conventions:
  * 201 — invite created
  * 200 — list / preview / accept
  * 204 — cancel
  * 400 — request shape problems / email mismatch on accept
  * 404 — invite not found
  * 409 — conflict (recipient unavailable, already-accepted invite)
  * 410 — gone (expired)
  * 429 — rate limited (public preview)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.auth import current_active_user
from app.core.permissions import current_superuser
from app.core.rate_limit import RateLimiter
from app.models.user.user import User
from app.schemas.platform.invite_accept_response import InviteAcceptResponse
from app.schemas.platform.invite_create_request import InviteCreateRequest
from app.schemas.platform.invite_info_response import InviteInfoResponse
from app.schemas.platform.invite_read import InviteRead
from app.services.platform import invite_service
from app.services.platform.invite_email import send_invite_email
from app.services.platform.invite_service import (
    InviteAlreadyAcceptedError,
    InviteEmailMismatchError,
    InviteExpiredError,
    InviteNotFoundError,
    InviteRecipientUnavailableError,
)
from platform_shared.core.request_utils import get_client_ip


admin_router = APIRouter(prefix="/admin/invites", tags=["admin"])
public_router = APIRouter(prefix="/invites", tags=["invites"])


# Per-IP throttle on the unauthenticated invite-preview endpoint. 30
# requests per 5 minutes is generous for a legitimate registration
# flow (a user might refresh the page a handful of times) but tight
# enough to make a 32-byte token brute-force economically infeasible
# even before the entropy math kicks in. Pre-instantiated at module
# import so all requests share the same sliding-window state.
_INVITE_INFO_LIMITER = RateLimiter(max_attempts=30, window_seconds=300)


def _to_read(invite) -> InviteRead:  # type: ignore[no-untyped-def]
    """Project an ORM row + its computed status into the API schema."""
    return InviteRead(
        id=invite.id,
        email=invite.email,
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
    admin: User = Depends(current_superuser),
) -> InviteRead:
    try:
        result = await invite_service.create_invite(
            email=body.email, admin_id=admin.id,
        )
    except InviteRecipientUnavailableError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    # Email send happens AFTER the row commits (the unit_of_work in the
    # service has already returned). If SMTP fails the row stays — the
    # admin can resend via a future cancel-and-reissue flow rather than
    # being left with an orphan email-but-no-row.
    send_invite_email(result.invite.email, result.raw_token)
    return _to_read(result.invite)


@admin_router.get("", response_model=list[InviteRead])
async def list_invites(
    admin: User = Depends(current_superuser),
) -> list[InviteRead]:
    invites = await invite_service.list_pending_invites()
    return [_to_read(i) for i in invites]


@admin_router.delete(
    "/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(current_superuser),
) -> None:
    try:
        await invite_service.cancel_invite(
            invite_id=invite_id, admin_id=admin.id,
        )
    except InviteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except InviteAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Public preview + authenticated accept
# ---------------------------------------------------------------------------


@public_router.get("/{token}/info", response_model=InviteInfoResponse)
async def get_invite_info(token: str, request: Request) -> InviteInfoResponse:
    """Public — no auth. Returns email + computed status + expires_at.

    Rate-limited per IP to prevent the endpoint becoming a token-
    validity oracle. Deliberately leaks no inviter identity / id /
    created_at — see ``InviteInfoResponse`` for the full reasoning.
    """
    _INVITE_INFO_LIMITER.check(get_client_ip(request))
    try:
        invite, computed_status = await invite_service.get_invite_info(token)
    except InviteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
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
        raise HTTPException(status_code=404, detail=str(e)) from e
    except InviteExpiredError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except InviteAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except InviteEmailMismatchError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    assert invite.accepted_at is not None  # set by mark_accepted
    return InviteAcceptResponse(
        invite_id=invite.id,
        accepted_at=invite.accepted_at,
    )
