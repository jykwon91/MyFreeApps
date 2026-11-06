"""Repository for organization and membership operations."""
import secrets
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
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


async def list_created_by(db: AsyncSession, user_id: uuid.UUID) -> Sequence[Organization]:
    result = await db.execute(select(Organization).where(Organization.created_by == user_id))
    return result.scalars().all()


async def created_workspace_has_other_members(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Whether anyone else belongs to a workspace this user created."""
    created = select(Organization.id).where(Organization.created_by == user_id)
    result = await db.execute(
        select(OrganizationMember.id)
        .where(
            OrganizationMember.user_id != user_id,
            OrganizationMember.organization_id.in_(created),
        )
        .limit(1)
    )
    return result.first() is not None


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


async def get_member_for_update(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember | None:
    """The membership, locked for this transaction so its role can't change under a decision about it."""
    result = await db.execute(
        select(OrganizationMember)
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def lock_member(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember | None:
    """The membership, share-locked so it can't be removed until this transaction ends.

    A removal waiting on the lock then sees anything this transaction wrote
    for the member, such as a Gmail connection, and removes that too.
    """
    result = await db.execute(
        select(OrganizationMember)
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
        .with_for_update(read=True)
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
    """Change the role now, waiting for any transaction that has the membership locked."""
    member.org_role = new_role
    await db.flush()
    return member


async def remove_member(db: AsyncSession, member: OrganizationMember) -> None:
    """Delete the membership now, waiting for any transaction that has it locked."""
    await db.delete(member)
    await db.flush()


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


async def has_created_demo_org(db: AsyncSession, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Organization.id)
        .where(Organization.created_by == user_id, Organization.is_demo.is_(True))
        .limit(1)
    )
    return result.first() is not None


async def delete_other_pending_invites(
    db: AsyncSession, org_id: uuid.UUID, email: str, keep_invite_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(OrganizationInvite).where(
            OrganizationInvite.organization_id == org_id,
            func.lower(OrganizationInvite.email) == email.lower(),
            OrganizationInvite.status == "pending",
            OrganizationInvite.id != keep_invite_id,
        )
    )
    for invite in result.scalars().all():
        await db.delete(invite)


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
