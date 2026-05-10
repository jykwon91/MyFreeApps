import uuid

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.permissions import (
    make_current_superuser,
    make_decode_token_iat,
    make_strict_superuser_gate,
    require_role as _shared_require_role,
)

from app.core.auth import current_active_user
from app.core.config import settings
from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, get_db
from app.models.organization.organization_member import OrgRole, OrganizationMember
from app.models.user.user import Role, User
from app.repositories import organization_repo
from app.repositories.demo import demo_repo
from app.services.user.totp_service import verify_totp_code as _verify_totp_code


def require_role(*roles: Role):
    return _shared_require_role(*roles, current_active_user=current_active_user)


current_admin = require_role(Role.ADMIN)
current_superuser = make_current_superuser(current_active_user)


# Strict superuser gate (PR F1) — three independent checks for the
# highest-risk admin endpoints (toggle superuser, demo CRUD today; more
# in PR F2). Defense-in-depth: a stolen JWT alone cannot exercise these.
async def _verify_totp_step_up(
    db: AsyncSession, user_id: uuid.UUID, code: str,
) -> None:
    """Adapter from the bool-returning service to the gate's None+raise contract."""
    if not await _verify_totp_code(db, user_id, code):
        raise HTTPException(status_code=403, detail="invalid_totp")


_decode_token_iat = make_decode_token_iat(secret_key=settings.secret_key)

# 60-min recent-auth window (PR F1). Operator must have logged in in the
# last hour to use the strict-gated endpoints; once an hour has passed,
# the gate emits X-Require-Step-Up: reauth and the frontend redirects to
# /login. The TOTP code requirement (X-TOTP-Code header) is independent
# and applies on every gated request.
current_strict_superuser = make_strict_superuser_gate(
    current_active_user=current_active_user,
    get_db=get_db,
    verify_totp_step_up=_verify_totp_step_up,
    decode_token_iat=_decode_token_iat,
    max_token_age_seconds=3600,
)


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
