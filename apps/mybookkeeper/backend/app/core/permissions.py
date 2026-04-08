import uuid

from fastapi import Depends, Header, HTTPException

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal
from app.models.organization.organization_member import OrgRole, OrganizationMember
from app.models.user.user import Role, User
from app.repositories import organization_repo
from app.repositories.demo import demo_repo


def require_role(*roles: Role):
    async def _check(user: User = Depends(current_active_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


current_admin = require_role(Role.ADMIN)


async def current_superuser(user: User = Depends(current_active_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser access required")
    return user


async def current_org_member(
    user: User = Depends(current_active_user),
    x_organization_id: str | None = Header(None),
) -> RequestContext:
    """Resolve the active organization for the current request.

    Reads X-Organization-Id header. If not provided, uses the user's
    first organization (personal workspace).
    """
    if not x_organization_id:
        raise HTTPException(
            status_code=422,
            detail="X-Organization-Id header is required",
        )
    try:
        org_id = uuid.UUID(x_organization_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid organization ID")

    async with AsyncSessionLocal() as db:
        member = await organization_repo.get_member(db, org_id, user.id)
        if not member:
            raise HTTPException(
                status_code=403,
                detail="Not a member of this organization",
            )

    return RequestContext(
        organization_id=member.organization_id,
        user_id=user.id,
        org_role=OrgRole(member.org_role),
    )


async def require_write_access(
    ctx: RequestContext = Depends(current_org_member),
) -> RequestContext:
    """Block viewers from write operations."""
    if ctx.org_role == OrgRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers have read-only access")
    return ctx


def require_org_role(*roles: OrgRole):
    """Dependency factory that checks the user's org role."""
    async def _check(
        ctx: RequestContext = Depends(current_org_member),
    ) -> RequestContext:
        if ctx.org_role not in roles:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions in this organization",
            )
        return ctx
    return _check


async def reject_demo_org(
    ctx: RequestContext = Depends(current_org_member),
) -> RequestContext:
    async with AsyncSessionLocal() as db:
        is_demo = await demo_repo.is_demo_org(db, ctx.organization_id)
    if is_demo:
        raise HTTPException(
            status_code=403,
            detail="This feature is not available for demo accounts",
        )
    return ctx


async def reject_demo_org_write(
    ctx: RequestContext = Depends(require_write_access),
) -> RequestContext:
    """Block viewers and demo orgs from write operations."""
    async with AsyncSessionLocal() as db:
        is_demo = await demo_repo.is_demo_org(db, ctx.organization_id)
    if is_demo:
        raise HTTPException(
            status_code=403,
            detail="This feature is not available for demo accounts",
        )
    return ctx


async def reject_demo_user(
    user: User = Depends(current_active_user),
) -> User:
    async with AsyncSessionLocal() as db:
        org = await demo_repo.get_org_by_user(db, user.id)
    if org and org.is_demo:
        raise HTTPException(
            status_code=403,
            detail="This feature is not available for demo accounts",
        )
    return user
