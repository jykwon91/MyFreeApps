"""Organization management — create, invite, accept, role changes."""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.organization.organization import Organization
from app.models.organization.organization_invite import OrganizationInvite
from app.models.organization.organization_member import OrgRole, OrganizationMember
from app.repositories import integration_repo, organization_repo, user_repo
from app.services.organization.invite_email import send_invite_email

logger = logging.getLogger(__name__)


async def create_organization(name: str, user_id: uuid.UUID) -> Organization:
    async with unit_of_work() as db:
        org = await organization_repo.create(db, name, user_id)
        logger.info("ORG_ACTION create org=%s user=%s", org.id, user_id)
        return org


async def list_user_organizations(
    user_id: uuid.UUID,
) -> list[dict]:
    """List all orgs a user belongs to, with their role."""
    async with AsyncSessionLocal() as db:
        memberships = await organization_repo.list_for_user(db, user_id)
        return [
            {
                "id": m.organization.id,
                "name": m.organization.name,
                "org_role": m.org_role,
                "is_demo": m.organization.is_demo,
                "created_at": m.organization.created_at,
            }
            for m in memberships
        ]


async def get_organization(org_id: uuid.UUID) -> Organization | None:
    async with AsyncSessionLocal() as db:
        return await organization_repo.get_by_id(db, org_id)


async def update_organization(
    org_id: uuid.UUID, name: str, user_id: uuid.UUID
) -> Organization:
    async with unit_of_work() as db:
        org = await organization_repo.get_by_id(db, org_id)
        if not org:
            raise LookupError("Organization not found")
        result = await organization_repo.update(db, org, name)
        logger.info("ORG_ACTION update org=%s user=%s", org_id, user_id)
        return result


async def delete_organization(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        org = await organization_repo.get_by_id(db, org_id)
        if not org:
            raise LookupError("Organization not found")
        await organization_repo.delete(db, org)
        logger.info("ORG_ACTION delete org=%s user=%s", org_id, user_id)


async def list_members(
    org_id: uuid.UUID,
) -> list[dict]:
    async with AsyncSessionLocal() as db:
        members = await organization_repo.list_members(db, org_id)
        return [
            {
                "id": m.id,
                "organization_id": m.organization_id,
                "user_id": m.user_id,
                "org_role": m.org_role,
                "joined_at": m.joined_at,
                "user_email": m.user.email if m.user else None,
                "user_name": m.user.name if m.user else None,
            }
            for m in members
        ]


async def update_member_role(
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: str,
    acting_user_id: uuid.UUID,
) -> OrganizationMember:
    if target_user_id == acting_user_id:
        raise ValueError("Cannot change your own role")
    valid_assignable_roles = {OrgRole.ADMIN, OrgRole.USER, OrgRole.VIEWER}
    try:
        parsed_role = OrgRole(new_role)
    except ValueError:
        raise ValueError(f"Invalid role: {new_role!r}")
    if parsed_role not in valid_assignable_roles:
        raise ValueError("Cannot assign owner role — use ownership transfer")

    async with unit_of_work() as db:
        member = await organization_repo.get_member(db, org_id, target_user_id)
        if not member:
            raise LookupError("Member not found")
        if member.org_role == "owner":
            raise ValueError("Cannot change the owner's role")

        old_role = member.org_role
        result = await organization_repo.update_member_role(db, member, new_role)
        if parsed_role == OrgRole.VIEWER:
            await _disconnect_their_integrations(
                db, org_id, target_user_id, reason="made_viewer", acting_user_id=acting_user_id,
            )
        logger.info(
            "ORG_ACTION role_change org=%s target=%s old=%s new=%s by=%s",
            org_id, target_user_id, old_role, new_role, acting_user_id,
        )
        return result


async def _disconnect_their_integrations(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    reason: str,
    acting_user_id: uuid.UUID,
) -> None:
    """Delete the connections ``user_id`` made, once they can no longer make one.

    A Gmail connection is the connecting member's mailbox, not the org's. Call
    after the membership change is flushed: a connect finishing at the same time
    holds a share lock on the membership, so that change waits for it, and under
    READ COMMITTED this query then sees the connection it saved.
    """
    for provider in await integration_repo.delete_connected_by(db, org_id, user_id):
        await log_auth_event(
            db,
            event_type=AuthEventType.OAUTH_DISCONNECT,
            user_id=user_id,
            succeeded=True,
            metadata={"provider": provider, "reason": reason, "by": str(acting_user_id)},
        )


async def remove_member(
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    acting_user_id: uuid.UUID,
) -> None:
    if target_user_id == acting_user_id:
        raise ValueError("Cannot remove yourself")

    async with unit_of_work() as db:
        member = await organization_repo.get_member(db, org_id, target_user_id)
        if not member:
            raise LookupError("Member not found")
        if member.org_role == "owner":
            raise ValueError("Cannot remove the owner")

        await organization_repo.remove_member(db, member)
        await _disconnect_their_integrations(
            db, org_id, target_user_id, reason="member_removed", acting_user_id=acting_user_id,
        )
        logger.info(
            "ORG_ACTION remove_member org=%s target=%s by=%s",
            org_id, target_user_id, acting_user_id,
        )


async def create_invite(
    org_id: uuid.UUID,
    email: str,
    org_role: str,
    invited_by: uuid.UUID,
) -> OrganizationInvite:
    if org_role == "owner":
        raise ValueError("Cannot invite as owner")

    email = email.strip().lower()

    async with unit_of_work() as db:
        existing_user = await user_repo.get_by_email_ci(db, email)
        if existing_user:
            existing_member = await organization_repo.get_member(db, org_id, existing_user.id)
            if existing_member:
                raise ValueError("This user is already a member of this organization")

        invite = await organization_repo.create_invite(
            db, org_id, email, org_role, invited_by,
        )

        org = await organization_repo.get_by_id(db, org_id)
        inviter = await user_repo.get_by_id(db, invited_by)
        inviter_display = (
            (inviter.name or inviter.email) if inviter else "A team member"
        )
        org_name = org.name if org else "your organization"

        email_sent = send_invite_email(
            recipient_email=email,
            org_name=org_name,
            org_role=org_role,
            inviter_name=inviter_display,
            invite_token=invite.token,
        )
        invite.email_sent = email_sent

        # Inviting someone again replaces their pending invite, so only the newest link
        # works. If the email failed, the older link is still the only one they have.
        if email_sent:
            await organization_repo.delete_other_pending_invites(db, org_id, email, invite.id)

        logger.info(
            "ORG_ACTION invite org=%s email=%s role=%s by=%s email_sent=%s",
            org_id, email, org_role, invited_by, email_sent,
        )
        return invite


async def list_invites(org_id: uuid.UUID) -> list[OrganizationInvite]:
    async with AsyncSessionLocal() as db:
        invites = await organization_repo.list_invites(db, org_id)
        return list(invites)


async def cancel_invite(
    org_id: uuid.UUID, invite_id: uuid.UUID, acting_user_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        invite = await organization_repo.cancel_invite(db, invite_id, org_id)
        if not invite:
            raise LookupError("Invite not found or already accepted")
        logger.info(
            "ORG_ACTION cancel_invite org=%s invite=%s by=%s",
            org_id, invite_id, acting_user_id,
        )


async def get_invite_info(token: str) -> dict:
    """Get invite details for preview — no auth required."""
    async with AsyncSessionLocal() as db:
        invite = await organization_repo.get_invite_by_token(db, token)
        if not invite:
            raise LookupError("Invite not found or expired")

        org = await organization_repo.get_by_id(db, invite.organization_id)
        inviter = await user_repo.get_by_id(db, invite.invited_by)
        invitee = await user_repo.get_by_email_ci(db, invite.email)

        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        return {
            "org_name": org.name if org else "Unknown",
            "org_role": invite.org_role,
            "inviter_name": (inviter.name or inviter.email) if inviter else "A team member",
            "email": invite.email,
            "expires_at": expires,
            "is_expired": expires < datetime.now(timezone.utc),
            "user_exists": invitee is not None,
        }


async def accept_invite(
    token: str, user_id: uuid.UUID
) -> OrganizationMember:
    async with unit_of_work() as db:
        invite = await organization_repo.get_invite_by_token(db, token)
        if not invite:
            raise LookupError("Invite not found or expired")
        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise ValueError("Invite has expired")

        user = await user_repo.get_by_id(db, user_id)
        if not user or user.email.lower() != invite.email.lower():
            logger.warning(
                "ORG_ACTION accept_invite_wrong_user org=%s user=%s",
                invite.organization_id, user_id,
            )
            raise PermissionError("This invite was sent to a different email address")

        existing = await organization_repo.get_member(
            db, invite.organization_id, user_id,
        )
        if existing:
            raise ValueError("Already a member of this organization")

        member = await organization_repo.accept_invite(db, invite, user_id)
        logger.info(
            "ORG_ACTION accept_invite org=%s user=%s role=%s",
            invite.organization_id, user_id, invite.org_role,
        )
        return member
