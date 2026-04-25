"""Repository for organization and membership operations."""
import secrets
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.organization.organization import Organization
from app.models.organization.organization_invite import OrganizationInvite
from app.models.organization.organization_member import OrganizationMember


async def create(db: AsyncSession, name: str, created_by: uuid.UUID) -> Organization:
    org = Organization(name=name, created_by=created_by)
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id,
        user_id=created_by,
        org_role="owner",
    )
    db.add(member)
    await db.flush()
    await db.refresh(org)
    return org


async def get_by_id(db: AsyncSession, org_id: uuid.UUID) -> Organization | None:
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    return result.scalar_one_or_none()


async def update(db: AsyncSession, org: Organization, name: str) -> Organization:
    org.name = name
    return org


async def delete(db: AsyncSession, org: Organization) -> None:
    await db.delete(org)


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> Sequence[OrganizationMember]:
    """List all orgs a user belongs to, with their role."""
    result = await db.execute(
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization))
        .where(OrganizationMember.user_id == user_id)
        .order_by(OrganizationMember.joined_at)
    )
    return result.scalars().unique().all()


async def get_member(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember | None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_members(db: AsyncSession, org_id: uuid.UUID) -> Sequence[OrganizationMember]:
    result = await db.execute(
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.user))
        .where(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.joined_at)
    )
    return result.scalars().unique().all()


async def update_member_role(
    db: AsyncSession, member: OrganizationMember, new_role: str
) -> OrganizationMember:
    member.org_role = new_role
    return member


async def remove_member(db: AsyncSession, member: OrganizationMember) -> None:
    await db.delete(member)


async def create_invite(
    db: AsyncSession,
    org_id: uuid.UUID,
    email: str,
    org_role: str,
    invited_by: uuid.UUID,
) -> OrganizationInvite:
    invite = OrganizationInvite(
        organization_id=org_id,
        email=email,
        org_role=org_role,
        invited_by=invited_by,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.flush()
    await db.refresh(invite)
    return invite


async def get_invite_by_token(db: AsyncSession, token: str) -> OrganizationInvite | None:
    result = await db.execute(
        select(OrganizationInvite).where(
            OrganizationInvite.token == token,
            OrganizationInvite.status == "pending",
        )
    )
    return result.scalar_one_or_none()


async def list_invites(
    db: AsyncSession, org_id: uuid.UUID
) -> Sequence[OrganizationInvite]:
    result = await db.execute(
        select(OrganizationInvite)
        .where(OrganizationInvite.organization_id == org_id)
        .order_by(OrganizationInvite.created_at.desc())
    )
    return result.scalars().all()


async def cancel_invite(
    db: AsyncSession, invite_id: uuid.UUID, org_id: uuid.UUID,
) -> OrganizationInvite | None:
    result = await db.execute(
        select(OrganizationInvite).where(
            OrganizationInvite.id == invite_id,
            OrganizationInvite.organization_id == org_id,
            OrganizationInvite.status == "pending",
        )
    )
    invite = result.scalar_one_or_none()
    if invite:
        await db.delete(invite)
    return invite


async def accept_invite(
    db: AsyncSession, invite: OrganizationInvite, user_id: uuid.UUID
) -> OrganizationMember:
    invite.status = "accepted"
    member = OrganizationMember(
        organization_id=invite.organization_id,
        user_id=user_id,
        org_role=invite.org_role,
        invited_by=invite.invited_by,
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return member
