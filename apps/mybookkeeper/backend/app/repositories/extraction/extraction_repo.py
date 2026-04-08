import uuid
from collections.abc import Sequence

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.extraction.extraction import Extraction


async def create(db: AsyncSession, extraction: Extraction) -> Extraction:
    db.add(extraction)
    await db.flush()
    return extraction


async def get_by_document(
    db: AsyncSession, document_id: uuid.UUID
) -> Sequence[Extraction]:
    result = await db.execute(
        select(Extraction)
        .where(Extraction.document_id == document_id)
        .order_by(Extraction.created_at.desc())
    )
    return result.scalars().all()


async def get_latest_by_document(
    db: AsyncSession, document_id: uuid.UUID
) -> Extraction | None:
    result = await db.execute(
        select(Extraction)
        .where(Extraction.document_id == document_id)
        .order_by(Extraction.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_status(
    db: AsyncSession,
    extraction: Extraction,
    status: str,
    error_message: str | None = None,
) -> None:
    extraction.status = status
    extraction.error_message = error_message
    await db.flush()


async def get_document_type(
    db: AsyncSession, extraction_id: uuid.UUID
) -> str | None:
    """Get the document_type of an extraction by ID."""
    result = await db.execute(
        select(Extraction.document_type).where(Extraction.id == extraction_id)
    )
    return result.scalar_one_or_none()


async def get_document_id(
    db: AsyncSession, extraction_id: uuid.UUID
) -> uuid.UUID | None:
    """Get the document_id of an extraction by ID."""
    result = await db.execute(
        select(Extraction.document_id).where(Extraction.id == extraction_id)
    )
    return result.scalar_one_or_none()


async def delete_by_document_ids(
    db: AsyncSession,
    document_ids: list[uuid.UUID],
) -> tuple[list[uuid.UUID], int]:
    """Delete all extractions for given document IDs. Returns (deleted extraction IDs, count)."""
    if not document_ids:
        return [], 0
    stmt = select(Extraction.id).where(Extraction.document_id.in_(document_ids))
    extraction_ids = [row[0] for row in (await db.execute(stmt)).all()]
    if not extraction_ids:
        return [], 0
    await db.execute(sa_delete(Extraction).where(Extraction.id.in_(extraction_ids)))
    return extraction_ids, len(extraction_ids)
