"""Repository for ``insurance_policy_attachments``.

Mirrors ``signed_lease_attachment_repo`` — including the
``delete_by_id_scoped_to_policy`` composite-WHERE pattern that prevents IDOR
attacks (lesson from the calendar/blackout PR #172 fix).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment


async def create(
    db: AsyncSession,
    *,
    policy_id: uuid.UUID,
    storage_key: str,
    filename: str,
    content_type: str,
    size_bytes: int,
    kind: str,
    uploaded_by_user_id: uuid.UUID,
    uploaded_at: datetime,
) -> InsurancePolicyAttachment:
    row = InsurancePolicyAttachment(
        policy_id=policy_id,
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


async def list_by_policy(
    db: AsyncSession,
    policy_id: uuid.UUID,
) -> list[InsurancePolicyAttachment]:
    result = await db.execute(
        select(InsurancePolicyAttachment)
        .where(InsurancePolicyAttachment.policy_id == policy_id)
        .order_by(InsurancePolicyAttachment.uploaded_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    attachment_id: uuid.UUID,
) -> InsurancePolicyAttachment | None:
    result = await db.execute(
        select(InsurancePolicyAttachment).where(
            InsurancePolicyAttachment.id == attachment_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_by_id_scoped_to_policy(
    db: AsyncSession,
    attachment_id: uuid.UUID,
    policy_id: uuid.UUID,
) -> InsurancePolicyAttachment | None:
    """Delete a single attachment row scoped to its parent policy.

    Both ``attachment_id`` AND ``policy_id`` must match — prevents an attacker
    from pairing a valid own-org ``policy_id`` with a leaked ``attachment_id``
    belonging to another tenant. Mirrors the blackout-attachment fix (PR #172).
    """
    result = await db.execute(
        select(InsurancePolicyAttachment).where(
            InsurancePolicyAttachment.id == attachment_id,
            InsurancePolicyAttachment.policy_id == policy_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    await db.execute(
        delete(InsurancePolicyAttachment).where(
            InsurancePolicyAttachment.id == attachment_id,
            InsurancePolicyAttachment.policy_id == policy_id,
        )
    )
    return row
