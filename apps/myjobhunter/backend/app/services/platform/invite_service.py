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
  * tokens expire 7 days after creation — `accept` raises ``InviteExpiredError``
    when called past the deadline

Security shape (PR fix/myjobhunter-invite-security-hardening, 2026-05-05):
  * Raw tokens generated here, hashed via
    ``app.services.platform.invite_token``, only the hash persists.
    The raw token is returned exactly once via ``CreateInviteResult`` so
    the route layer can pass it to the email send before discarding.
  * Audit-log metadata strips PII to ``email_domain`` on the create
    path (the recipient is by definition not yet a user, so per the
    auth-events policy we never log their full email for unknown-user
    events).
  * The 409-collision response collapses the "already-registered user"
    and "already-pending invite" branches into a single generic body so
    a compromised-admin token cannot enumerate which case applies.
  * The email send is moved OUT of the create transaction. Row commits
    first; if SMTP fails, the row stays and the admin can resend.
    Previously SMTP failures rolled back the row, opening a race where
    the email could land while the row didn't (orphan email).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.platform.invite import PlatformInvite
from app.repositories.platform import invite_repo
from app.repositories.user import user_repo
from app.schemas.platform.invite_status import InviteStatus
from app.services.platform.invite_email import send_invite_email
from app.services.platform.invite_token import generate_token, hash_token
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


class InviteRecipientUnavailableError(InviteError):
    """The recipient email cannot accept a new invite.

    Collapses two underlying causes — already-registered user OR pending
    invite already in flight — into a single error so a compromised
    admin token cannot enumerate which case applies. The route layer
    maps this to a single generic 409 body.
    """


class InviteNotFoundError(InviteError):
    """No invite row matches the given token / id."""


class InviteExpiredError(InviteError):
    """The invite's expires_at is in the past."""


class InviteAlreadyAcceptedError(InviteError):
    """The invite has already been consumed."""


class InviteEmailMismatchError(InviteError):
    """The accepting user's email doesn't match the invite's bound email."""


# ---------------------------------------------------------------------------
# Service-layer return shapes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CreateInviteResult:
    """Return shape for ``create_invite``.

    The raw token lives here for exactly one purpose: hand it to the
    email sender at the route layer, then drop it. It is NEVER persisted
    and NEVER returned to the admin in the API response.
    """

    invite: PlatformInvite
    raw_token: str


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
# PII helpers
# ---------------------------------------------------------------------------


def _email_domain(email: str) -> str:
    """Extract the domain portion of an email address.

    Returns the lowercased substring after the last '@'. Falls back to
    the literal ``"unknown"`` for inputs without an '@' so the audit
    log never carries a malformed value masquerading as a domain.
    """
    _, _, domain = email.rpartition("@")
    domain = domain.strip().lower()
    return domain or "unknown"


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_invite(
    *,
    email: str,
    admin_id: uuid.UUID,
) -> CreateInviteResult:
    """Create a new invite row and return the raw token for one-shot email use.

    Two-stage transaction shape:
      1. Open ``unit_of_work``, validate uniqueness, insert the row +
         audit log, and commit.
      2. Return the raw token; the caller (route layer) hands it to the
         email sender. SMTP failures are surfaced to the admin via 5xx
         but the row is already persisted, so the admin can resend.

    Raises:
        InviteRecipientUnavailableError: the email already belongs to a
            user account OR a pending invite is in flight.
    """
    normalized = email.strip().lower()
    raw_token = generate_token()
    token_h = hash_token(raw_token)

    async with unit_of_work() as db:
        existing_user = await user_repo.get_by_email(db, normalized)
        if existing_user is not None:
            raise InviteRecipientUnavailableError(
                "Cannot send invite to this email."
            )

        existing_invite = await invite_repo.get_pending_for_email(db, normalized)
        if existing_invite is not None:
            raise InviteRecipientUnavailableError(
                "Cannot send invite to this email."
            )

        invite = await invite_repo.create(
            db,
            email=normalized,
            token_hash=token_h,
            created_by=admin_id,
        )

        await log_auth_event(
            db,
            event_type=INVITE_CREATED,
            user_id=admin_id,
            succeeded=True,
            metadata={
                "invite_id": str(invite.id),
                "email_domain": _email_domain(normalized),
            },
        )
        logger.info(
            "Platform invite created id=%s email_domain=%s by_admin=%s",
            invite.id, _email_domain(normalized), admin_id,
        )
        return CreateInviteResult(invite=invite, raw_token=raw_token)


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
        cancelled_email_domain = _email_domain(invite.email)
        await invite_repo.delete(db, invite)
        await log_auth_event(
            db,
            event_type=INVITE_CANCELLED,
            user_id=admin_id,
            succeeded=True,
            metadata={
                "invite_id": str(invite_id),
                "email_domain": cancelled_email_domain,
            },
        )
        logger.info(
            "Platform invite cancelled id=%s by_admin=%s",
            invite_id, admin_id,
        )


async def get_invite_info(token: str) -> tuple[PlatformInvite, InviteStatus]:
    """Public preview lookup.

    Hashes the incoming raw token before lookup. Returns the invite +
    its computed status. The route layer projects this into the
    (deliberately narrow) ``InviteInfoResponse`` schema — only ``email`` /
    ``status`` / ``expires_at`` reach the wire.

    Raises:
        InviteNotFoundError: no row matches the token's hash.
    """
    token_h = hash_token(token)
    async with AsyncSessionLocal() as db:
        invite = await invite_repo.get_by_token_hash(db, token_h)
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

    Hashes the incoming raw token before lookup. The accepting user
    must already be authenticated AND their email must match the
    invite's bound email (case-insensitive).

    Raises:
        InviteNotFoundError:        no row matches the token's hash.
        InviteExpiredError:         expires_at is in the past.
        InviteAlreadyAcceptedError: accepted_at is non-null already.
        InviteEmailMismatchError:   the accepting user's email differs
            from the bound email.
    """
    normalized = user_email.strip().lower()
    token_h = hash_token(token)

    async with unit_of_work() as db:
        invite = await invite_repo.get_by_token_hash(db, token_h)
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
                "invited_by": str(invite.created_by),
            },
        )
        logger.info(
            "Platform invite accepted id=%s user=%s",
            invite.id, user_id,
        )
        return accepted


__all__ = [
    "CreateInviteResult",
    "INVITE_ACCEPTED",
    "INVITE_CANCELLED",
    "INVITE_CREATED",
    "InviteAlreadyAcceptedError",
    "InviteEmailMismatchError",
    "InviteError",
    "InviteExpiredError",
    "InviteNotFoundError",
    "InviteRecipientUnavailableError",
    "accept_invite",
    "cancel_invite",
    "compute_status",
    "create_invite",
    "get_invite_info",
    "list_pending_invites",
    "send_invite_email",
]
