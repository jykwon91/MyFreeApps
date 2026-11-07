"""Test-only helpers for E2E tests that need a second member of an organization.

``POST /test/users`` makes a verified, signed-in account without spending the
per-IP sign-up and sign-in limits, which a full E2E run would otherwise exceed.
The account then joins through a real invite: the invite token only leaves the
server in the invite email, so ``GET /test/invites/{id}/token`` hands it to the
test, which accepts it through the real endpoint with the invited role.
``DELETE /test/invites/{id}`` removes the invite afterwards: the real cancel
only removes pending ones, and an accepted invite outlives the account.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi_users.password import PasswordHelper
from pydantic import BaseModel, EmailStr, Field

from app.core.auth import get_jwt_strategy
from app.core.context import RequestContext
from app.core.permissions import require_org_role
from app.db.session import unit_of_work
from app.models.organization.organization_member import OrgRole
from app.repositories import organization_repo, user_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()

_org_admin = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)

_password_helper = PasswordHelper()


class _CreateUserRequest(BaseModel):
    model_config = {"extra": "forbid"}

    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=255)


class _CreatedUser(BaseModel):
    id: uuid.UUID
    access_token: str


class _InviteToken(BaseModel):
    token: str


@router.post("/test/users", status_code=201)
async def create_user(payload: _CreateUserRequest) -> _CreatedUser:
    """A verified account with no organization, and a token signed in as it."""
    _require_test_mode()
    async with unit_of_work() as db:
        if await user_repo.get_by_email_ci(db, payload.email):
            raise HTTPException(status_code=409, detail="User already exists")
        user = await user_repo.create_verified(
            db, payload.email, _password_helper.hash(payload.password), payload.name,
        )
    token = await get_jwt_strategy().write_token(user)
    return _CreatedUser(id=user.id, access_token=token)


@router.get("/test/invites/{invite_id}/token")
async def get_invite_token(
    invite_id: uuid.UUID,
    ctx: RequestContext = Depends(_org_admin),
) -> _InviteToken:
    """The token of a pending invite to my organization."""
    _require_test_mode()
    async with unit_of_work() as db:
        invite = await organization_repo.get_pending_invite(db, invite_id, ctx.organization_id)
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")
        return _InviteToken(token=invite.token)


@router.delete("/test/invites/{invite_id}", status_code=204)
async def delete_invite(
    invite_id: uuid.UUID,
    ctx: RequestContext = Depends(_org_admin),
) -> None:
    """Delete an invite to my organization, accepted or not."""
    _require_test_mode()
    async with unit_of_work() as db:
        if not await organization_repo.delete_invite(db, invite_id, ctx.organization_id):
            raise HTTPException(status_code=404, detail="Invite not found")
