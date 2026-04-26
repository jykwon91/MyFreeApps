"""Organization management routes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_user, require_org_role
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.core.auth import current_active_user
from app.schemas.organization.invite_accept_response import InviteAcceptResponse
from app.schemas.organization.organization import (
    InviteCreate,
    InviteInfoResponse,
    InviteRead,
    MemberRead,
    MemberRoleUpdate,
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
    OrgWithRole,
)
from app.services.organization import organization_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _verify_org_access(org_id: uuid.UUID, ctx: RequestContext) -> None:
    """Raise 403 if the caller's org context doesn't match the path param."""
    if org_id != ctx.organization_id:
        raise HTTPException(status_code=403, detail="Not a member of this organization")


@router.post("", response_model=OrganizationRead, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    user: User = Depends(reject_demo_user),
) -> OrganizationRead:
    org = await organization_service.create_organization(body.name, user.id)
    return OrganizationRead.model_validate(org)


@router.get("", response_model=list[OrgWithRole])
async def list_organizations(
    user: User = Depends(current_active_user),
) -> list[OrgWithRole]:
    orgs = await organization_service.list_user_organizations(user.id)
    return [OrgWithRole(**o) for o in orgs]


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> OrganizationRead:
    _verify_org_access(org_id, ctx)
    org = await organization_service.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationRead.model_validate(org)


@router.patch("/{org_id}", response_model=OrganizationRead)
async def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> OrganizationRead:
    _verify_org_access(org_id, ctx)
    try:
        org = await organization_service.update_organization(org_id, body.name, ctx.user_id)
        return OrganizationRead.model_validate(org)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER)),
) -> None:
    _verify_org_access(org_id, ctx)
    try:
        await organization_service.delete_organization(org_id, ctx.user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{org_id}/members", response_model=list[MemberRead])
async def list_members(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[MemberRead]:
    _verify_org_access(org_id, ctx)
    members = await organization_service.list_members(org_id)
    return [MemberRead(**m) for m in members]


@router.patch("/{org_id}/members/{user_id}/role", response_model=MemberRead)
async def update_member_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> MemberRead:
    _verify_org_access(org_id, ctx)
    try:
        member = await organization_service.update_member_role(
            org_id, user_id, body.org_role, ctx.user_id,
        )
        return MemberRead(
            id=member.id,
            organization_id=member.organization_id,
            user_id=member.user_id,
            org_role=member.org_role,
            joined_at=member.joined_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    _verify_org_access(org_id, ctx)
    try:
        await organization_service.remove_member(org_id, user_id, ctx.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{org_id}/invites", response_model=InviteRead, status_code=201)
async def create_invite(
    org_id: uuid.UUID,
    body: InviteCreate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> InviteRead:
    _verify_org_access(org_id, ctx)
    try:
        invite = await organization_service.create_invite(
            org_id, body.email, body.org_role, ctx.user_id,
        )
        return InviteRead.model_validate(invite)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{org_id}/invites", response_model=list[InviteRead])
async def list_invites(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> list[InviteRead]:
    _verify_org_access(org_id, ctx)
    invites = await organization_service.list_invites(org_id)
    return [InviteRead.model_validate(i) for i in invites]


@router.delete("/{org_id}/invites/{invite_id}", status_code=204)
async def cancel_invite(
    org_id: uuid.UUID,
    invite_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    _verify_org_access(org_id, ctx)
    try:
        await organization_service.cancel_invite(org_id, invite_id, ctx.user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/invites/{token}/info", response_model=InviteInfoResponse)
async def get_invite_info(token: str) -> InviteInfoResponse:
    """Public endpoint — no auth required. Returns invite preview."""
    try:
        info = await organization_service.get_invite_info(token)
        return InviteInfoResponse(**info)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/invites/{token}/accept", status_code=200)
async def accept_invite(
    token: str,
    user: User = Depends(reject_demo_user),
) -> InviteAcceptResponse:
    try:
        member = await organization_service.accept_invite(token, user.id)
        return InviteAcceptResponse(
            organization_id=str(member.organization_id),
            org_role=member.org_role,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
