import asyncio
import email as email_lib
import uuid
from urllib.parse import quote

from app.core.context import RequestContext
from app.core.storage import get_storage
from app.db.session import AsyncSessionLocal
from app.models.documents.document import Document
from app.models.responses.download_result import DownloadResult
from app.repositories import document_repo, integration_repo
from app.services.email.gmail_service import get_gmail_service, fetch_email_by_id

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

        if doc.file_storage_key:
            storage = get_storage()
            if storage is None:
                raise ValueError("File stored in object storage but MinIO is not configured")
            file_bytes = storage.download_file(doc.file_storage_key)
            media_type = doc.file_mime_type or "application/octet-stream"
            fname = doc.file_name or "file"
            disposition = "inline" if media_type in _RENDERABLE_MIME_TYPES else f"attachment; filename*=UTF-8''{quote(fname)}"
            return DownloadResult(content=file_bytes, media_type=media_type, disposition=disposition)

        if doc.file_content:
            media_type = doc.file_mime_type or "application/octet-stream"
            fname = doc.file_name or "file"
            disposition = "inline" if media_type in _RENDERABLE_MIME_TYPES else f"attachment; filename*=UTF-8''{quote(fname)}"
            return DownloadResult(content=doc.file_content, media_type=media_type, disposition=disposition)

        if not doc.email_message_id:
            raise ValueError("No source file available for this document")

        integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
        if not integration:
            raise ValueError("Gmail integration not connected")

        service = get_gmail_service(integration.access_token, integration.refresh_token)
        email_data = await asyncio.to_thread(fetch_email_by_id, service, doc.email_message_id)
        if not email_data:
            raise ValueError("Email no longer available in Gmail")

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
            att_filename = att["filename"]
            media_type = att["content_type"] or "application/octet-stream"
            disposition = "inline" if media_type in _RENDERABLE_MIME_TYPES else f"attachment; filename*=UTF-8''{quote(att_filename)}"
            return DownloadResult(content=att["data"], media_type=media_type, disposition=disposition)

        body = email_data.get("body", "")
        return DownloadResult(content=body.encode(), media_type="text/plain", disposition="inline")
