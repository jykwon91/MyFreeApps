"""Repository for ``signed_lease_attachments``.

Mirrors ``listing_blackout_attachment_repo`` — including the
``delete_by_id_scoped_to_lease`` composite-WHERE pattern that prevents IDOR
attacks (lesson from the calendar/blackout PR #172 fix).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease_attachment import SignedLeaseAttachment


async def create(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    storage_key: str,
    filename: str,
    content_type: str,
    size_bytes: int,
    kind: str,
    uploaded_by_user_id: uuid.UUID,
    uploaded_at: datetime,
) -> SignedLeaseAttachment:
    row = SignedLeaseAttachment(
        lease_id=lease_id,
        storage_key=storage_key,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        kind=kind,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_at=uploaded_at,
    )
    db.add(row)
    await db.flush()
    return row


async def list_by_lease(
    db: AsyncSession,
    lease_id: uuid.UUID,
) -> list[SignedLeaseAttachment]:
    result = await db.execute(
        select(SignedLeaseAttachment)
        .where(SignedLeaseAttachment.lease_id == lease_id)
        .order_by(SignedLeaseAttachment.uploaded_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    attachment_id: uuid.UUID,
) -> SignedLeaseAttachment | None:
    result = await db.execute(
        select(SignedLeaseAttachment).where(
            SignedLeaseAttachment.id == attachment_id,
        )
    )
    return result.scalar_one_or_none()


async def update_kind_scoped_to_lease(
    db: AsyncSession,
    attachment_id: uuid.UUID,
    lease_id: uuid.UUID,
    kind: str,
) -> SignedLeaseAttachment | None:
    """Update the kind of an attachment, scoped to its parent lease.

    Both ``attachment_id`` AND ``lease_id`` must match — prevents IDOR.
    Returns the updated row, or None if the composite key does not match.
    """
    result = await db.execute(
        select(SignedLeaseAttachment).where(
            SignedLeaseAttachment.id == attachment_id,
            SignedLeaseAttachment.lease_id == lease_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    await db.execute(
        update(SignedLeaseAttachment)
        .where(
            SignedLeaseAttachment.id == attachment_id,
            SignedLeaseAttachment.lease_id == lease_id,
        )
        .values(kind=kind)
    )
    await db.refresh(row)
    return row


async def delete_by_id_scoped_to_lease(
    db: AsyncSession,
    attachment_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> SignedLeaseAttachment | None:
    """Delete a single attachment row scoped to its parent lease.

    Both ``attachment_id`` AND ``lease_id`` must match — prevents an attacker
    from pairing a valid own-org ``lease_id`` with a leaked ``attachment_id``
    belonging to another tenant. Mirrors the blackout-attachment fix.
    """
    result = await db.execute(
        select(SignedLeaseAttachment).where(
            SignedLeaseAttachment.id == attachment_id,
            SignedLeaseAttachment.lease_id == lease_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    await db.execute(
        delete(SignedLeaseAttachment).where(
            SignedLeaseAttachment.id == attachment_id,
            SignedLeaseAttachment.lease_id == lease_id,
        )
    )
    return row
