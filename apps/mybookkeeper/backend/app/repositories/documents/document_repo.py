"""Document repository — file-storage queries only.

Financial queries (dedup by vendor/date, summary aggregations) now live in
transaction_repo and booking_statement_repo.
"""
import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import or_, select, func, update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.models.documents.document import Document


async def list_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    status: str | None = None,
    exclude_processing: bool | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Document]:
    stmt = (
        select(Document)
        .where(Document.organization_id == organization_id, Document.deleted_at.is_(None))
    )

    if exclude_processing:
        stmt = stmt.where(Document.status.notin_(["processing", "extracting", "duplicate", "deleted"]))
    if property_id is not None:
        stmt = stmt.where(Document.property_id == property_id)
    if status is not None:
        stmt = stmt.where(Document.status == status)

    stmt = stmt.order_by(Document.created_at.desc())

    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, document_id: uuid.UUID, organization_id: uuid.UUID
) -> Document | None:
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_id_internal(
    db: AsyncSession, document_id: uuid.UUID
) -> Document | None:
    """Fetch a document without user scoping. For worker/internal use only."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    return result.scalar_one_or_none()


async def get_by_id_with_content(
    db: AsyncSession, document_id: uuid.UUID, organization_id: uuid.UUID
) -> Document | None:
    result = await db.execute(
        select(Document)
        .options(undefer(Document.file_content))
        .where(
            Document.id == document_id,
            Document.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_id_with_content_internal(
    db: AsyncSession, document_id: uuid.UUID
) -> Document | None:
    """Fetch a document with file content without user scoping. For worker/internal use only."""
    result = await db.execute(
        select(Document)
        .options(undefer(Document.file_content))
        .where(Document.id == document_id)
    )
    return result.scalar_one_or_none()


async def list_by_status(
    db: AsyncSession, organization_id: uuid.UUID, status: str
) -> Sequence[Document]:
    result = await db.execute(
        select(Document)
        .where(Document.organization_id == organization_id, Document.status == status)
        .order_by(Document.created_at.asc())
    )
    return result.scalars().all()


async def create(db: AsyncSession, document: Document) -> Document:
    db.add(document)
    await db.flush()
    return document


async def refresh(db: AsyncSession, document: Document) -> None:
    await db.refresh(document)


async def delete(db: AsyncSession, document: Document) -> None:
    document.deleted_at = datetime.now(timezone.utc)
    document.status = "deleted"


async def find_by_content_hash(
    db: AsyncSession, organization_id: uuid.UUID, content_hash: str
) -> Document | None:
    """Find a non-deleted document with the same content hash."""
    result = await db.execute(
        select(Document).where(
            Document.organization_id == organization_id,
            Document.content_hash == content_hash,
            Document.deleted_at.is_(None),
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def delete_failed_by_name(
    db: AsyncSession, organization_id: uuid.UUID, file_name: str
) -> int:
    """Soft-delete failed documents matching the filename so re-uploads replace them."""
    result = await db.execute(
        sa_update(Document)
        .where(
            Document.organization_id == organization_id,
            Document.file_name == file_name,
            Document.status == "failed",
            Document.deleted_at.is_(None),
        )
        .values(status="deleted", deleted_at=datetime.now(timezone.utc))
    )
    return result.rowcount  # type: ignore[return-value]


async def bulk_delete(
    db: AsyncSession, document_ids: list[uuid.UUID], organization_id: uuid.UUID
) -> int:
    """Soft-delete documents that belong to org. Returns count."""
    result = await db.execute(
        sa_update(Document)
        .where(Document.id.in_(document_ids), Document.organization_id == organization_id)
        .values(status="deleted", deleted_at=datetime.now(timezone.utc))
    )
    return result.rowcount  # type: ignore[return-value]


async def claim_next_processing(
    db: AsyncSession, user_id: uuid.UUID | None = None
) -> Document | None:
    """Claim the next document with status='processing' (including retry-eligible), mark it 'extracting', and commit."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(Document)
        .where(
            Document.status == "processing",
            or_(Document.next_retry_at.is_(None), Document.next_retry_at <= now),
        )
        .order_by(Document.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if user_id is not None:
        stmt = stmt.where(Document.user_id == user_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if doc:
        doc.status = "extracting"
        await db.commit()
    return doc


async def get_processing_user_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Get distinct user IDs that have documents in 'processing' status (including retry-eligible)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Document.user_id)
        .where(
            Document.status == "processing",
            or_(Document.next_retry_at.is_(None), Document.next_retry_at <= now),
        )
        .distinct()
    )
    return [row[0] for row in result.all()]


async def get_email_message_ids(
    db: AsyncSession, organization_id: uuid.UUID
) -> set[str]:
    result = await db.execute(
        select(Document.email_message_id).where(
            Document.organization_id == organization_id,
            Document.email_message_id.isnot(None),
        )
    )
    return {row[0] for row in result.all()}


async def get_batch_status_counts(
    db: AsyncSession, organization_id: uuid.UUID, batch_id: str
) -> dict[str, int]:
    """Return {status: count} for all documents in a batch."""
    result = await db.execute(
        select(Document.status, func.count())
        .where(Document.organization_id == organization_id, Document.batch_id == batch_id)
        .group_by(Document.status)
    )
    return {row[0]: row[1] for row in result.all()}


async def delete_batch_processing(
    db: AsyncSession, organization_id: uuid.UUID, batch_id: str
) -> int:
    """Delete all unprocessed documents in a batch. Returns count deleted."""
    result = await db.execute(
        sa_delete(Document)
        .where(
            Document.organization_id == organization_id,
            Document.batch_id == batch_id,
            Document.status.in_(["processing", "extracting"]),
        )
    )
    return result.rowcount  # type: ignore[return-value]


async def get_by_ids(
    db: AsyncSession, document_ids: list[uuid.UUID],
) -> dict[uuid.UUID, Document]:
    """Batch-fetch documents by ID. Returns {id: Document} map."""
    if not document_ids:
        return {}
    result = await db.execute(
        select(Document).where(Document.id.in_(document_ids))
    )
    return {d.id: d for d in result.scalars().all()}


async def list_by_document_type(
    db: AsyncSession,
    organization_id: uuid.UUID,
    document_type: str,
) -> list[Document]:
    """Find all non-deleted documents of a given type."""
    result = await db.execute(
        select(Document)
        .where(
            Document.organization_id == organization_id,
            Document.document_type == document_type,
            Document.deleted_at.is_(None),
        )
        .order_by(Document.created_at.asc())
    )
    return list(result.scalars().all())


async def reset_to_processing(
    db: AsyncSession,
    document_ids: list[uuid.UUID],
    organization_id: uuid.UUID,
) -> int:
    """Reset documents to processing for re-extraction. Returns count updated."""
    if not document_ids:
        return 0
    result = await db.execute(
        sa_update(Document)
        .where(
            Document.id.in_(document_ids),
            Document.organization_id == organization_id,
        )
        .values(
            status="processing",
            error_message=None,
            retry_count=0,
            next_retry_at=None,
        )
    )
    return result.rowcount  # type: ignore[return-value]


async def count_by_status(
    db: AsyncSession,
    organization_id: uuid.UUID,
    status: str,
) -> int:
    """Count non-deleted documents with the given status."""
    result = await db.execute(
        select(func.count())
        .select_from(Document)
        .where(
            Document.organization_id == organization_id,
            Document.status == status,
            Document.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


async def count_retry_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    """Count non-deleted processing documents that are waiting for a retry."""
    result = await db.execute(
        select(func.count())
        .select_from(Document)
        .where(
            Document.organization_id == organization_id,
            Document.status == "processing",
            Document.next_retry_at.isnot(None),
            Document.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> Sequence[Document]:
    """Return all non-deleted documents owned by a user (for data export)."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == user_id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


async def reset_failed_retryable(
    db: AsyncSession,
    organization_id: uuid.UUID,
    max_retries: int,
) -> int:
    """Reset failed documents whose retry_count is below max_retries back to processing.

    Returns count of documents reset.
    """
    result = await db.execute(
        sa_update(Document)
        .where(
            Document.organization_id == organization_id,
            Document.status == "failed",
            Document.retry_count < max_retries,
            Document.deleted_at.is_(None),
        )
        .values(status="processing", next_retry_at=None, error_message=None)
    )
    return result.rowcount  # type: ignore[return-value]
