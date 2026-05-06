"""Data access for the ``platform_invites`` table.

Bare-function shape mirrors the rest of MJH's repository layer (no
classes). Every public function takes the ``AsyncSession`` first; the
service layer is responsible for choosing between ``unit_of_work`` (for
writes) and ``AsyncSessionLocal`` (for reads).

Security shape (2026-05-05): tokens are persisted as sha256 hashes via
the ``token_hash`` column. Lookups go through ``get_by_token_hash``;
the service layer is responsible for computing the hash before calling.
The repository never sees raw tokens.

Tenant scoping notes:
- Invite ownership is admin-scoped, not tenant-scoped — every admin can
  see every pending invite. Tenant isolation here is "is this row
  visible to a non-admin?"; the answer is no, and that gate is enforced
  at the route layer via ``current_superuser``.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform.invite import PlatformInvite


async def create(
    db: AsyncSession,
    *,
    email: str,
    token_hash: str,
    created_by: uuid.UUID,
) -> PlatformInvite:
    """Insert a fresh invite row.

    ``token_hash`` is computed by the service layer from the raw token
    before this is called. ``expires_at`` is populated by a model-level
    default.
    """
    invite = PlatformInvite(
        email=email, token_hash=token_hash, created_by=created_by,
    )
    db.add(invite)
    await db.flush()
    await db.refresh(invite)
    return invite


async def get_by_id(
    db: AsyncSession, invite_id: uuid.UUID,
) -> PlatformInvite | None:
    result = await db.execute(
        select(PlatformInvite).where(PlatformInvite.id == invite_id)
    )
    return result.scalar_one_or_none()


async def get_by_token_hash(
    db: AsyncSession, token_hash: str,
) -> PlatformInvite | None:
    """Look up an invite by its sha256 hash regardless of state.

    Returns the row even when expired or already accepted — the service
    layer decides whether the state allows the requested action and
    raises the right HTTP-mapped exception. We intentionally do NOT
    filter on ``accepted_at IS NULL`` here so the public preview
    endpoint can render an explanatory "this invite has been used"
    page instead of a generic 404.
    """
    result = await db.execute(
        select(PlatformInvite).where(PlatformInvite.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def list_pending(db: AsyncSession) -> Sequence[PlatformInvite]:
    """Return un-accepted invites, newest first.

    Includes expired-but-not-accepted rows so the admin UI can show
    "this invite expired" rows and offer a cancel/resend control.
    """
    result = await db.execute(
        select(PlatformInvite)
        .where(PlatformInvite.accepted_at.is_(None))
        .order_by(PlatformInvite.created_at.desc())
    )
    return result.scalars().all()


async def get_pending_for_email(
    db: AsyncSession, email: str,
) -> PlatformInvite | None:
    """Return a single pending+un-expired invite for the given email, if any.

    Used by the create flow to short-circuit duplicate sends. Email
    matching is case-insensitive — addresses are lowercased on write so
    a direct equality check is sufficient.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PlatformInvite).where(
            PlatformInvite.email == email,
            PlatformInvite.accepted_at.is_(None),
            PlatformInvite.expires_at > now,
        )
    )
    return result.scalar_one_or_none()


async def mark_accepted(
    db: AsyncSession,
    *,
    invite: PlatformInvite,
    user_id: uuid.UUID,
) -> PlatformInvite:
    """Mark the invite as accepted by ``user_id``.

    Idempotent at the row level — the service layer is the one that
    rejects already-accepted invites with a 409 before this is called.
    """
    invite.accepted_at = datetime.now(timezone.utc)
    invite.accepted_by = user_id
    await db.flush()
    await db.refresh(invite)
    return invite


async def delete(db: AsyncSession, invite: PlatformInvite) -> None:
    """Hard-delete an invite row (admin cancel flow)."""
    await db.delete(invite)
    await db.flush()
