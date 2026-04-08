"""Document service — file-storage operations (delete, replace, re-extract, cancel batch)."""
import logging
import uuid

from app.core.config import settings
from app.core.context import RequestContext
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories import document_repo, transaction_repo
from app.services.extraction.extractor_service import detect_file_type

logger = logging.getLogger(__name__)


async def delete_document(
    ctx: RequestContext, document_id: uuid.UUID
) -> bool:
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
        if not doc:
            return False
        if doc.file_storage_key:
            storage = get_storage()
            if storage:
                storage.delete_file(doc.file_storage_key)
        await document_repo.delete(db, doc)
        return True


async def bulk_delete_documents(
    ctx: RequestContext, document_ids: list[uuid.UUID]
) -> int:
    async with unit_of_work() as db:
        count = await document_repo.bulk_delete(db, document_ids, ctx.organization_id)
        return count


async def replace_file(
    ctx: RequestContext, document_id: uuid.UUID,
    content: bytes, filename: str, content_type: str,
) -> None:
    if len(content) > settings.max_upload_size_bytes:
        raise ValueError(f"File exceeds {settings.max_upload_size_bytes // (1024 * 1024)}MB limit")

    file_type = detect_file_type(filename, content_type)
    if file_type == "unknown":
        raise ValueError("Unsupported file type")

    async with unit_of_work() as db:
        doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
        if not doc:
            raise ValueError("Document not found")

        storage = get_storage()
        if storage:
            if doc.file_storage_key:
                storage.delete_file(doc.file_storage_key)
            key = storage.generate_key(str(ctx.organization_id), filename)
            storage.upload_file(key, content, content_type)
            doc.file_content = None
            doc.file_storage_key = key
        else:
            doc.file_content = content
            doc.file_storage_key = None

        doc.file_name = filename
        doc.file_type = file_type
        doc.file_mime_type = content_type


async def re_extract_document(
    ctx: RequestContext, document_id: uuid.UUID
) -> bool:
    """Reset a document to processing so the worker re-extracts it. Returns False if not found."""
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id_with_content(db, document_id, ctx.organization_id)
        if not doc:
            return False
        if not doc.file_content and not doc.file_storage_key:
            raise ValueError("Document has no file content to re-extract")
        if doc.status in ("processing", "extracting"):
            raise ValueError("Document is already being processed")
        doc.status = "processing"
        doc.error_message = None
        return True


async def set_escrow_paid(
    ctx: RequestContext, document_id: uuid.UUID, escrow_paid: bool,
) -> dict:
    """Toggle escrow-paid flag. When enabled, soft-deletes linked transactions.

    Returns {"is_escrow_paid": bool, "transactions_removed": int}.
    """
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
        if not doc:
            raise ValueError("Document not found")

        doc.is_escrow_paid = escrow_paid
        transactions_removed = 0

        if escrow_paid:
            deleted_txns = await transaction_repo.soft_delete_by_document_id(
                db, document_id, ctx.organization_id,
            )
            transactions_removed = len(deleted_txns)
            if transactions_removed > 0:
                logger.info(
                    "Escrow-paid: soft-deleted %d transactions for doc %s",
                    transactions_removed, document_id,
                )

    return {
        "is_escrow_paid": escrow_paid,
        "transactions_removed": transactions_removed,
    }


async def cancel_batch(ctx: RequestContext, batch_id: str) -> int:
    """Delete all unprocessed documents in a batch. Returns count deleted."""
    async with unit_of_work() as db:
        count = await document_repo.delete_batch_processing(db, ctx.organization_id, batch_id)
        return count
