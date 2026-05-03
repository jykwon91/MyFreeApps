"""Repository for ``lease_template_files``."""
from __future__ import annotations

import uuid

from sqlalchemy import delete as _sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template_file import LeaseTemplateFile


async def create(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    filename: str,
    storage_key: str,
    content_type: str,
    size_bytes: int,
    display_order: int,
) -> LeaseTemplateFile:
    row = LeaseTemplateFile(
        template_id=template_id,
        filename=filename,
        storage_key=storage_key,
        content_type=content_type,
        size_bytes=size_bytes,
        display_order=display_order,
    )
    db.add(row)
    await db.flush()
    return row


async def list_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> list[LeaseTemplateFile]:
    result = await db.execute(
        select(LeaseTemplateFile)
        .where(LeaseTemplateFile.template_id == template_id)
        .order_by(LeaseTemplateFile.display_order.asc(), LeaseTemplateFile.created_at.asc())
    )
    return list(result.scalars().all())


async def delete_all_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> list[str]:
    """Delete all files for a template, returning the storage keys to clean up."""
    result = await db.execute(
        select(LeaseTemplateFile.storage_key).where(
            LeaseTemplateFile.template_id == template_id,
        )
    )
    keys = [row[0] for row in result.all()]
    await db.execute(
        _sa_delete(LeaseTemplateFile).where(
            LeaseTemplateFile.template_id == template_id,
        )
    )
    return keys
