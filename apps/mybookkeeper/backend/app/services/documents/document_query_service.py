import asyncio
import email as email_lib
import uuid
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.storage import get_storage
from app.db.session import AsyncSessionLocal
from app.mappers.document_summary_mapper import to_document_summary
from app.models.documents.document import Document
from app.models.responses.download_result import DownloadResult
from app.repositories import document_list_repo, document_repo, integration_repo
from app.schemas.documents.document import DocumentRead
from app.schemas.documents.document_filters import DocumentFilters
from app.schemas.documents.document_list_page import DocumentListPage
from app.schemas.documents.document_page_query import DocumentPageQuery
from app.schemas.documents.document_selection_ref import DocumentSelectionRef
from app.schemas.documents.document_summary import DocumentSummary
from app.services.documents.document_mime_constants import EMAIL_FILE_TYPE
from app.services.documents.document_mime_type import (
    servable_document_mime_type,
    stored_document_mime_type,
)
from app.services.email.gmail_credentials import persist_refreshed_token
from app.services.email.gmail_service import fetch_email_by_id, get_gmail_service
from app.services.storage.stored_file import load_stored_file

_RENDERABLE_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}


def _extract_renderable_from_eml(eml_bytes: bytes) -> dict[str, str | bytes] | None:
    msg = email_lib.message_from_bytes(eml_bytes)
    for part in msg.walk():
        content_type = part.get_content_type()
        if content_type in _RENDERABLE_MIME_TYPES:
            data = part.get_payload(decode=True)
            if data:
                filename = part.get_filename() or f"attachment.{content_type.split('/')[-1]}"
                return {"filename": filename, "content_type": content_type, "data": data}
    return None


def _download_result(content: bytes, media_type: str, filename: str) -> DownloadResult:
    """Only renderable types are served inline; anything else downloads."""
    disposition = "inline" if media_type in _RENDERABLE_MIME_TYPES else f"attachment; filename*=UTF-8''{quote(filename)}"
    return DownloadResult(content=content, media_type=media_type, disposition=disposition)


async def get_document(ctx: RequestContext, document_id: uuid.UUID) -> Document | None:
    async with AsyncSessionLocal() as db:
        return await document_repo.get_by_id(db, document_id, ctx.organization_id)


async def list_documents(
    ctx: RequestContext,
    *,
    property_id: uuid.UUID | None = None,
    status: str | None = None,
    exclude_processing: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Document]:
    async with AsyncSessionLocal() as db:
        result = await document_repo.list_filtered(
            db, ctx.organization_id,
            property_id=property_id,
            status=status,
            exclude_processing=exclude_processing,
            limit=limit,
            offset=offset,
        )
        return list(result)


async def list_document_page(ctx: RequestContext, query: DocumentPageQuery) -> DocumentListPage:
    """One page of the list, and how many documents the same filters match across every page."""
    async with AsyncSessionLocal() as db:
        rows = await document_list_repo.list_page(
            db, ctx.organization_id, query,
            sort_by=query.sort_by, sort_dir=query.sort_dir, limit=query.limit, offset=query.offset,
        )
        total = await document_list_repo.count_filtered(db, ctx.organization_id, query)
    items = [DocumentRead.model_validate(row) for row in rows]
    return DocumentListPage(items=items, total=total, has_more=query.offset + len(items) < total)


async def list_selection_refs(ctx: RequestContext, filters: DocumentFilters) -> list[DocumentSelectionRef]:
    """Every document the filters match, as little as "select all" needs to tick it."""
    async with AsyncSessionLocal() as db:
        rows = await document_list_repo.list_selection_refs(db, ctx.organization_id, filters)
    return [DocumentSelectionRef(id=row.id, status=row.status) for row in rows]


async def get_summary(ctx: RequestContext) -> DocumentSummary:
    """Counts for the Home screen, so it needn't download the whole list."""
    async with AsyncSessionLocal() as db:
        counts = await document_repo.get_status_counts(db, ctx.organization_id)
    return to_document_summary(counts)


async def get_batch_status(ctx: RequestContext, batch_id: str) -> dict[str, str | int]:
    """Return processing progress for a batch of documents."""
    async with AsyncSessionLocal() as db:
        counts = await document_repo.get_batch_status_counts(db, ctx.organization_id, batch_id)

    total = sum(counts.values())
    in_progress = counts.get("processing", 0) + counts.get("extracting", 0)
    completed = total - in_progress
    return {
        "batch_id": batch_id,
        "total": total,
        "completed": completed,
        "failed": counts.get("failed", 0),
        "status": "processing" if in_progress > 0 else "done",
    }


async def get_single_status(ctx: RequestContext, document_id: uuid.UUID) -> dict[str, str] | None:
    """Return processing status for a single document upload."""
    async with AsyncSessionLocal() as db:
        doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
        if not doc:
            return None
        return {"status": doc.status}


async def get_document_download(
    ctx: RequestContext, document_id: uuid.UUID
) -> DownloadResult | None:
    """Returns DownloadResult or None if not found. Raises ValueError for missing source."""
    async with AsyncSessionLocal() as db:
        doc = await document_repo.get_by_id_with_content(db, document_id, ctx.organization_id)
        if not doc:
            return None
        if not doc.file_storage_key:
            return await _download_from_row_or_email(db, ctx, doc)
        storage_key, mime_type, file_name = doc.file_storage_key, doc.file_mime_type, doc.file_name

    # Read with the session closed, so no pooled connection waits on storage.
    file_bytes = await load_stored_file(get_storage(), storage_key)
    return _download_result(file_bytes, servable_document_mime_type(mime_type), file_name or "file")


async def _download_from_row_or_email(
    db: AsyncSession, ctx: RequestContext, doc: Document,
) -> DownloadResult:
    """A document kept in its row, or one still in the user's Gmail."""
    if doc.file_content:
        media_type = servable_document_mime_type(doc.file_mime_type)
        return _download_result(doc.file_content, media_type, doc.file_name or "file")

    if not doc.email_message_id:
        raise ValueError("No source file available for this document")

    integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
    if not integration:
        raise ValueError("Gmail integration not connected")

    service, creds = get_gmail_service(integration.access_token, integration.refresh_token)
    prior_token = creds.token
    email_data = await asyncio.to_thread(fetch_email_by_id, service, doc.email_message_id)
    if not email_data:
        raise ValueError("Email no longer available in Gmail")
    await persist_refreshed_token(integration, creds, prior_token)

    attachments = email_data.get("attachments", [])
    if attachments:
        att = (
            next((a for a in attachments if a["filename"] == doc.file_name), None)
            or next((a for a in attachments if a["content_type"] in _RENDERABLE_MIME_TYPES), None)
            or attachments[0]
        )
        if att["filename"].lower().endswith(".eml"):
            inner = _extract_renderable_from_eml(att["data"])
            if inner:
                att = inner
        # The attachment's header is the sender's claim; serve what the bytes are.
        media_type = stored_document_mime_type(att["data"], EMAIL_FILE_TYPE)
        return _download_result(att["data"], media_type, att["filename"])

    body = email_data.get("body", "")
    return DownloadResult(content=body.encode(), media_type="text/plain", disposition="inline")
