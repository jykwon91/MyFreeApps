import asyncio
import hashlib
import uuid

from app.core.config import settings
from app.core.context import RequestContext
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.models.documents.document import Document
from app.repositories import document_repo, usage_log_repo
from app.repositories.demo import demo_repo
from app.services.extraction.extractor_service import detect_file_type, extract_zip_files


def _store_file(
    org_id: uuid.UUID, filename: str, content: bytes, content_type: str,
) -> tuple[bytes | None, str | None]:
    """Upload to MinIO if configured, returning (file_content, file_storage_key).

    When MinIO is available: uploads the file and returns (None, key).
    When MinIO is unavailable: returns (content, None) for database storage.
    """
    storage = get_storage()
    if storage is None:
        return content, None
    key = storage.generate_key(str(org_id), filename)
    storage.upload_file(key, content, content_type)
    return None, key


async def accept_upload(
    ctx: RequestContext,
    content: bytes,
    filename: str,
    content_type: str,
    property_id: uuid.UUID | None = None,
) -> dict[str, str | int | None]:
    """Validate and save placeholder document(s) for async processing.

    For zip files, extracts all supported files and creates one document per file.
    Returns dict with document_id (primary), batch_id (if zip), and batch_total.
    Raises ValueError for limit exceeded or unsupported file type.
    """
    if len(content) == 0:
        raise ValueError("File is empty")

    if len(content) > settings.max_upload_size_bytes:
        raise ValueError(f"File exceeds {settings.max_upload_size_bytes // (1024 * 1024)}MB limit")

    file_type = detect_file_type(filename, content_type)
    if file_type == "unknown":
        raise ValueError("Unsupported file type")

    async with unit_of_work() as db:
        today_count = await usage_log_repo.count_today(db, ctx.organization_id)

        # Demo orgs get a stricter daily upload limit
        is_demo = await demo_repo.is_demo_org(db, ctx.organization_id)
        max_uploads = settings.demo_max_uploads_per_day if is_demo else settings.max_uploads_per_user_per_day
        if today_count >= max_uploads:
            raise ValueError("Daily upload limit reached")

        if file_type == "zip":
            extracted = await asyncio.to_thread(extract_zip_files, content)
            if not extracted:
                raise ValueError("No supported files found in zip")

            batch_id = str(uuid.uuid4())
            first_doc_id: uuid.UUID | None = None

            for name, data, mime in extracted:
                child_type = detect_file_type(name, mime)
                stored_content, storage_key = _store_file(ctx.organization_id, name, data, mime)
                doc = Document(
                    organization_id=ctx.organization_id,
                    user_id=ctx.user_id,
                    property_id=property_id,
                    file_name=name,
                    file_type=child_type,
                    file_content=stored_content,
                    file_storage_key=storage_key,
                    file_mime_type=mime,
                    source="upload",
                    status="processing",
                    batch_id=batch_id,
                )
                created = await document_repo.create(db, doc)
                if first_doc_id is None:
                    first_doc_id = created.id

            return {
                "document_id": str(first_doc_id),
                "batch_id": batch_id,
                "batch_total": len(extracted),
            }

        # Dedup: check if we already have this exact file (by content hash)
        content_hash = hashlib.sha256(content).hexdigest()
        existing = await document_repo.find_by_content_hash(db, ctx.organization_id, content_hash)
        if existing and existing.status != "failed":
            return {"document_id": str(existing.id), "batch_id": None, "batch_total": 1, "duplicate": True}

        # Delete any failed document with the same hash or filename to avoid duplicates on re-upload
        if existing and existing.status == "failed":
            await document_repo.delete(db, existing)
        else:
            await document_repo.delete_failed_by_name(db, ctx.organization_id, filename)

        stored_content, storage_key = _store_file(ctx.organization_id, filename, content, content_type)
        doc = Document(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            property_id=property_id,
            file_name=filename,
            file_type=file_type,
            file_content=stored_content,
            file_storage_key=storage_key,
            file_mime_type=content_type,
            content_hash=content_hash,
            source="upload",
            status="processing",
        )
        created = await document_repo.create(db, doc)
        return {"document_id": str(created.id), "batch_id": None, "batch_total": 1}
