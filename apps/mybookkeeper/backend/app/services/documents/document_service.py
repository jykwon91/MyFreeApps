"""Document service — file-storage operations (delete, replace, re-extract, cancel batch)."""
import logging
import uuid

from app.core.config import settings
from app.core.context import RequestContext
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.models.responses.document_delete_result import DocumentDeleteResult
from app.repositories import document_repo, transaction_repo
from app.services.documents.document_errors import DocumentBeingReadError
from app.services.documents.document_read_state import is_being_read, is_claimed_by_worker
from app.services.documents.document_upload_service import clean_document_file
from app.services.extraction.extractor_service import (
    detect_file_type,
    unsupported_file_message,
)
from app.services.storage.stored_file_cleanup import delete_stored_files

logger = logging.getLogger(__name__)


async def delete_documents(
    ctx: RequestContext, document_ids: list[uuid.UUID],
) -> DocumentDeleteResult:
    """Soft-delete the organization's live documents; the one path behind single and bulk delete.

    Documents still being read by extraction are refused. Stored files are removed
    only after the database commit, so a failed commit never loses a file.
    """
    requested = list(dict.fromkeys(document_ids))
    being_read: list[uuid.UUID] = []
    deletable: list[uuid.UUID] = []
    storage_keys: list[str] = []

    async with unit_of_work() as db:
        live = {
            doc.id: doc
            for doc in await document_repo.list_active_by_ids_for_update(
                db, requested, ctx.organization_id,
            )
        }
        for document_id in requested:
            doc = live.get(document_id)
            if doc is None:
                continue
            if is_being_read(doc):
                being_read.append(document_id)
                continue
            if doc.file_storage_key:
                storage_keys.append(doc.file_storage_key)
            deletable.append(document_id)
        await document_repo.soft_delete_by_user(db, deletable)

    await delete_stored_files(storage_keys)
    return DocumentDeleteResult(
        deleted=deletable,
        not_found=[i for i in requested if i not in live],
        being_read=being_read,
    )


async def replace_file(
    ctx: RequestContext, document_id: uuid.UUID,
    content: bytes, filename: str, content_type: str,
) -> None:
    if len(content) > settings.max_upload_size_bytes:
        raise ValueError(f"File exceeds {settings.max_upload_size_bytes // (1024 * 1024)}MB limit")

    file_type = detect_file_type(filename, content_type)
    if file_type == "unknown":
        raise ValueError(unsupported_file_message(filename))

    content = await clean_document_file(content, filename)

    new_key: str | None = None
    old_key: str | None = None
    try:
        async with unit_of_work() as db:
            doc = await document_repo.get_by_id_with_content(
                db, document_id, ctx.organization_id, for_update=True,
            )
            if not doc:
                raise ValueError("Document not found")
            if is_being_read(doc):
                raise DocumentBeingReadError()

            storage = get_storage()
            if storage:
                old_key = doc.file_storage_key
                new_key = storage.generate_key(str(ctx.organization_id), filename)
                storage.upload_file(new_key, content, content_type)
                doc.file_content = None
                doc.file_storage_key = new_key
            else:
                doc.file_content = content
                doc.file_storage_key = None

            doc.file_name = filename
            doc.file_type = file_type
            doc.file_mime_type = content_type
    except Exception:
        # The row did not change, so the object uploaded for it is an orphan.
        await delete_stored_files([new_key] if new_key else [])
        raise

    await delete_stored_files([old_key] if old_key else [])


async def re_extract_document(
    ctx: RequestContext, document_id: uuid.UUID
) -> bool:
    """Reset a document to processing so the worker re-extracts it. Returns False if not found."""
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id_with_content(
            db, document_id, ctx.organization_id, for_update=True,
        )
        if not doc:
            return False
        if not doc.file_content and not doc.file_storage_key:
            raise ValueError("Document has no file content to re-extract")
        if is_being_read(doc):
            raise DocumentBeingReadError()
        doc.status = "processing"
        doc.error_message = None
        return True


async def set_escrow_paid(
    ctx: RequestContext, document_id: uuid.UUID, escrow_paid: bool,
) -> dict:
    """Toggle the reference-only flag. When enabled, soft-deletes linked transactions
    (unmarking does not restore them). Refused while the document is being read.

    Returns {"is_escrow_paid": bool, "transactions_removed": int}.
    """
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id(
            db, document_id, ctx.organization_id, for_update=True,
        )
        if not doc:
            raise ValueError("Document not found")
        if is_being_read(doc):
            raise DocumentBeingReadError()

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
    """Cancel a batch's queued documents. Returns the count cancelled.

    A document a live worker has claimed is left to finish: it is being read.
    """
    storage_keys: list[str] = []
    async with unit_of_work() as db:
        unfinished = await document_repo.list_unfinished_in_batch_for_update(
            db, ctx.organization_id, batch_id,
        )
        cancellable = [d for d in unfinished if not is_claimed_by_worker(d)]
        storage_keys = [d.file_storage_key for d in cancellable if d.file_storage_key]
        await document_repo.soft_delete_by_user(db, [d.id for d in cancellable])

    await delete_stored_files(storage_keys)
    return len(cancellable)
