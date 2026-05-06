"""Platform invite orchestration.

Layered architecture:

  routes  → service (this file)  → repository  → model

Routes never touch ``db`` directly; the service owns ``unit_of_work`` /
``AsyncSessionLocal`` lifecycle. Auth-event audit lines are emitted on
every state transition (created / accepted / cancelled) so the operator
can reconstruct the full lifecycle of an invite from the auth_events
table — important when a recipient claims they never got the link.

Business rules enforced here:
  * the recipient email must be a fresh address — no pending invite for
    the same email, no existing user account on that email
  * tokens are single-use — accepting consumes the row
  * tokens expire 7 days after creation — `accept` raises ValueError
    when called past the deadline
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.platform.invite import PlatformInvite
from app.repositories.platform import invite_repo
from app.repositories.user import user_repo
from app.schemas.platform.invite_status import InviteStatus
from app.services.platform.invite_email import send_invite_email
from app.services.system.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)


# Auth-event types — MJH-local, not promoted to platform_shared.AuthEventType
# because invite-specific events have no analogue in MBK's auth event taxonomy.
# If/when MJH ports orgs/members and MBK gains platform-level invites too,
# these can be promoted to platform_shared.
INVITE_CREATED = "platform_invite.created"
INVITE_ACCEPTED = "platform_invite.accepted"
INVITE_CANCELLED = "platform_invite.cancelled"


# ---------------------------------------------------------------------------
# Custom exceptions — caught at the route layer and translated to HTTP
# ---------------------------------------------------------------------------


class InviteError(Exception):
    """Base for invite-flow business-rule violations."""


class InviteAlreadyExistsError(InviteError):
    """A pending, un-expired invite already exists for this email."""


class UserAlreadyRegisteredError(InviteError):
    """The recipient email is already a registered MJH user."""


class InviteNotFoundError(InviteError):
    """No invite row matches the given token / id."""


class InviteExpiredError(InviteError):
    """The invite's expires_at is in the past."""


class InviteAlreadyAcceptedError(InviteError):
    """The invite has already been consumed."""


class InviteEmailMismatchError(InviteError):
    """The accepting user's email doesn't match the invite's bound email."""


# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------


def compute_status(invite: PlatformInvite, *, now: datetime | None = None) -> InviteStatus:
    """Project the row's stored state into an API-surface enum.

    Source of truth: ``accepted_at`` non-null → ACCEPTED; else if
    ``expires_at <= now`` → EXPIRED; else PENDING. ``now`` is parameterised
    for deterministic tests.
    """
    when = now or datetime.now(timezone.utc)
    if invite.accepted_at is not None:
        return InviteStatus.ACCEPTED
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= when:
        return InviteStatus.EXPIRED
    return InviteStatus.PENDING


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_invite(
    *,
    email: str,
    admin_id: uuid.UUID,
) -> PlatformInvite:
    """Create + email a new invite to ``email``.

    Raises:
        UserAlreadyRegisteredError: the email already has an MJH account.
        InviteAlreadyExistsError:   a pending invite for this email is
            still un-expired.
    """
    normalized = email.strip().lower()

    async with unit_of_work() as db:
        existing_user = await user_repo.get_by_email(db, normalized)
        if existing_user is not None:
            raise UserAlreadyRegisteredError(
                "An account with this email already exists."
            )

        existing_invite = await invite_repo.get_pending_for_email(db, normalized)
        if existing_invite is not None:
            raise InviteAlreadyExistsError(
                "A pending invite already exists for this email."
            )

        invite = await invite_repo.create(
            db, email=normalized, created_by=admin_id,
        )

        # Email send happens BEFORE the audit row is written so that a
        # send failure rolls back the row insertion via the
        # unit_of_work transaction. Otherwise the admin sees a 5xx but
        # an orphan invite row stays in the DB confusingly. Console-mode
        # send_email_or_raise never raises, so dev/CI exits this block
        # with the row committed.
        send_invite_email(normalized, invite.token)

        await log_auth_event(
            db,
            event_type=INVITE_CREATED,
            user_id=admin_id,
            succeeded=True,
            metadata={"invite_id": str(invite.id), "email": normalized},
        )
        logger.info(
            "Platform invite created id=%s email=%s by_admin=%s",
            invite.id, normalized, admin_id,
        )
        return invite


async def list_pending_invites() -> list[PlatformInvite]:
    """Return un-accepted invites (admin view).

    Includes expired-but-not-accepted rows so the admin UI can offer a
    "cancel" button on stale rows.
    """
    async with AsyncSessionLocal() as db:
        rows = await invite_repo.list_pending(db)
        return list(rows)


async def cancel_invite(
    *,
    invite_id: uuid.UUID,
    admin_id: uuid.UUID,
) -> None:
    """Hard-delete an un-accepted invite.

    Raises:
        InviteNotFoundError:        no row with that id.
        InviteAlreadyAcceptedError: the invite was already consumed —
            cancelling an accepted invite would silently un-link the
            user, which is the wrong shape; refuse instead.
    """
    async with unit_of_work() as db:
        invite = await invite_repo.get_by_id(db, invite_id)
        if invite is None:
            raise InviteNotFoundError("Invite not found.")
        if invite.accepted_at is not None:
            raise InviteAlreadyAcceptedError(
                "Cannot cancel an invite that has already been accepted."
            )
        await invite_repo.delete(db, invite)
        await log_auth_event(
            db,
            event_type=INVITE_CANCELLED,
            user_id=admin_id,
            succeeded=True,
            metadata={"invite_id": str(invite_id), "email": invite.email},
        )
        logger.info(
            "Platform invite cancelled id=%s by_admin=%s",
            invite_id, admin_id,
        )


async def get_invite_info(token: str) -> tuple[PlatformInvite, InviteStatus]:
    """Public preview lookup.

    Returns the invite + its computed status. The route layer projects
    this into the (deliberately narrow) ``InviteInfoResponse`` schema —
    only ``email`` / ``status`` / ``expires_at`` reach the wire.

    Raises:
        InviteNotFoundError: no row matches the token.
    """
    async with AsyncSessionLocal() as db:
        invite = await invite_repo.get_by_token(db, token)
        if invite is None:
            raise InviteNotFoundError("Invite not found.")
        status = compute_status(invite)
        return invite, status


async def accept_invite(
    *,
    token: str,
    user_id: uuid.UUID,
    user_email: str,
) -> PlatformInvite:
    """Mark the invite consumed by ``user_id``.

    The accepting user must already be authenticated AND their email
    must match the invite's bound email (case-insensitive). The
    registration flow on the frontend will: (a) prefill the email
    field with the invite's email, (b) call ``POST /auth/register``
    with that email, (c) verify via the email link, (d) log in,
    (e) call this endpoint with the token from the URL.

    Raises:
        InviteNotFoundError:        no row matches the token.
        InviteExpiredError:         expires_at is in the past.
        InviteAlreadyAcceptedError: accepted_at is non-null already.
        InviteEmailMismatchError:   the accepting user's email differs
            from the bound email.
    """
    normalized = user_email.strip().lower()

    async with unit_of_work() as db:
        invite = await invite_repo.get_by_token(db, token)
        if invite is None:
            raise InviteNotFoundError("Invite not found.")

        if invite.accepted_at is not None:
            raise InviteAlreadyAcceptedError(
                "This invite has already been accepted."
            )

        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= datetime.now(timezone.utc):
            raise InviteExpiredError("This invite has expired.")

        if invite.email.lower() != normalized:
            raise InviteEmailMismatchError(
                "This invite is not for the signed-in account."
            )

        accepted = await invite_repo.mark_accepted(
            db, invite=invite, user_id=user_id,
        )
        await log_auth_event(
            db,
            event_type=INVITE_ACCEPTED,
            user_id=user_id,
            succeeded=True,
            metadata={
                "invite_id": str(invite.id),
                "email": invite.email,
                "invited_by": str(invite.created_by),
            },
        )
        logger.info(
            "Platform invite accepted id=%s user=%s",
            invite.id, user_id,
        )
        return accepted
