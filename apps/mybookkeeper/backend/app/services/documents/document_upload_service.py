import asyncio
import hashlib
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.core.storage import get_storage
from app.core.upload_size_messages import document_too_large_message
from app.db.session import unit_of_work
from app.models.documents.document import Document
from app.repositories import document_repo, usage_log_repo
from app.repositories.demo import demo_repo
from app.schemas.documents.prepared_document_file import PreparedDocumentFile
from app.services.documents.document_mime_type import stored_document_mime_type
from app.services.extraction.extractor_service import (
    detect_file_type,
    extract_zip_files,
    unsupported_file_message,
)
from app.services.storage.attachment_content import (
    UnreadableImage,
    strip_photo_metadata,
)
from app.services.transactions.reference_ownership import assert_references_owned
from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.committed_write_guard import CommittedWriteGuard
from platform_shared.services.storage.object_upload import upload_objects
from platform_shared.services.storage.rows_present import RowsPresent


async def clean_document_file(content: bytes, filename: str) -> bytes:
    """Strip a photo's metadata (GPS location included) before it is stored.

    Raises:
        ValueError: the file is a photo that can't be re-encoded.
    """
    try:
        return await asyncio.to_thread(strip_photo_metadata, content)
    except UnreadableImage as exc:
        raise ValueError(f"Couldn't read the image '{filename}'") from exc


async def _prepare_files(
    org_id: uuid.UUID, content: bytes, filename: str, file_type: str,
) -> list[PreparedDocumentFile]:
    """The files to store: the upload itself (already cleaned), or every
    supported file in a zip.

    Every photo in a zip is cleaned before any file is stored, so one that can't
    be read rejects the zip without leaving files behind.
    """
    if file_type == "zip":
        extracted = await asyncio.to_thread(extract_zip_files, content)
        if not extracted:
            raise ValueError("No supported files found in zip")
        members = [
            (name, await clean_document_file(data, name), detect_file_type(name, guessed))
            for name, data, guessed in extracted
        ]
    else:
        members = [(filename, content, file_type)]
    storage = get_storage()
    return [
        PreparedDocumentFile(
            file_name=name,
            file_type=member_type,
            stored=NewStoredObject(
                storage.generate_key(str(org_id), name),
                data,
                stored_document_mime_type(data, member_type),
            ),
        )
        for name, data, member_type in members
    ]


def _documents_present_check(org_id: uuid.UUID, keys: list[str]) -> RowsPresent:
    """A plain read: the rows are new, so there is no existing row to lock."""

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            return await document_repo.any_with_storage_keys(db, org_id, keys)

    return rows_present


def _earlier_batch_result(earlier: Sequence[Document]) -> dict[str, str | int | None]:
    """The answer the first upload of a zip got, for a resend whose answer was lost."""
    first = earlier[0]
    in_batch = [d for d in earlier if d.batch_id == first.batch_id]
    return {
        "document_id": str(first.id),
        "batch_id": first.batch_id,
        "batch_total": len(in_batch),
        "duplicate": True,
    }


async def accept_upload(
    ctx: RequestContext,
    content: bytes,
    filename: str,
    content_type: str,
    property_id: uuid.UUID | None = None,
    *,
    reference_only: bool = False,
) -> dict[str, str | int | None]:
    """Validate and save placeholder document(s) for async processing.

    For zip files, extracts all supported files and creates one document per file.
    Returns dict with document_id (primary), batch_id (if zip), and batch_total.
    Raises ValueError for limit exceeded, unsupported file type, or a
    ``property_id`` that is not one of the caller's properties.

    ``reference_only`` stores the file as source material rather than as
    something to bill against. It sets the same flag the Documents page exposes
    as "mark as reference-only", which the extractor short-circuits on before it
    ever calls the model — so an Electricity Facts Label read into a utility
    plan lands in the library without minting a transaction against the
    property. Dedup deliberately does not apply the flag retroactively: a file
    already uploaded for extraction keeps the transactions it produced, and the
    operator can still toggle the flag by hand afterwards.
    """
    if len(content) == 0:
        raise ValueError("File is empty")

    if len(content) > settings.max_upload_size_bytes:
        raise ValueError(document_too_large_message())

    file_type = detect_file_type(filename, content_type)
    if file_type == "unknown":
        raise ValueError(unsupported_file_message(filename))

    if file_type != "zip":
        content = await clean_document_file(content, filename)

    # Answered or refused before anything is stored: a resend of a file already
    # accepted gets its earlier answer, and an unowned property or a used-up
    # daily limit uploads nothing. A plain read; the transaction checks again.
    async with unit_of_work() as db:
        standing, _ = await _earlier_upload(db, ctx, content, file_type, for_update=False)
        if standing is None:
            await _assert_upload_allowed(db, ctx, property_id)
    if standing is not None:
        return standing

    # Files go to storage before the transaction opens, so no row lock or
    # pooled connection is held while they upload.
    files = await _prepare_files(ctx.organization_id, content, filename, file_type)
    new_keys = [f.stored.key for f in files]
    storage = get_storage()
    await upload_objects(storage, [f.stored for f in files])
    async with CommittedWriteGuard(
        storage,
        new_keys,
        _documents_present_check(ctx.organization_id, new_keys),
        absence_conclusive=False,
    ) as guard:
        async with unit_of_work() as db:
            result, unreferenced_keys = await _save_placeholder_documents(
                db, ctx, content, file_type, property_id, reference_only, files,
            )
            guard.set_superseded(unreferenced_keys)
            guard.rows_written()
    return result


async def _save_placeholder_documents(
    db: AsyncSession,
    ctx: RequestContext,
    content: bytes,
    file_type: str,
    property_id: uuid.UUID | None,
    reference_only: bool,
    files: list[PreparedDocumentFile],
) -> tuple[dict[str, str | int | None], list[str]]:
    """Insert the placeholder rows for the stored ``files``.

    Also returns the stored files no row points at once this commits: those of
    replaced failed uploads, or ``files`` themselves when the upload turns out
    to be a duplicate.
    """
    new_keys = [f.stored.key for f in files]
    # Checked again under the locks: a concurrent upload of the same bytes may
    # have landed meanwhile, and gets its earlier answer back before the limit
    # (which that upload just used) is counted.
    standing, replaced = await _earlier_upload(db, ctx, content, file_type, for_update=True)
    if standing is not None:
        return standing, new_keys
    await _assert_upload_allowed(db, ctx, property_id)
    content_hash = hashlib.sha256(content).hexdigest()

    if file_type == "zip":
        # Every file of the earlier batch failed: it is replaced, like a failed single file.
        superseded = await document_repo.soft_delete_still_failed(db, ctx.organization_id, [d.id for d in replaced])
        batch_id = str(uuid.uuid4())
        first_doc_id: uuid.UUID | None = None
        for f in files:
            created = await document_repo.create(db, _placeholder(
                ctx, f, property_id, reference_only, batch_id=batch_id, batch_content_hash=content_hash,
            ))
            if first_doc_id is None:
                first_doc_id = created.id
        return (
            {"document_id": str(first_doc_id), "batch_id": batch_id, "batch_total": len(files)},
            superseded,
        )

    # Delete any failed document with the same hash or filename to avoid duplicates on re-upload
    if not replaced:
        replaced = list(await document_repo.list_failed_by_name_for_update(db, ctx.organization_id, files[0].file_name))
    # Only documents still failed are replaced: one re-extracted meanwhile keeps its row and file.
    superseded = await document_repo.soft_delete_still_failed(db, ctx.organization_id, [d.id for d in replaced])

    created = await document_repo.create(db, _placeholder(
        ctx, files[0], property_id, reference_only, content_hash=content_hash,
    ))
    return (
        {"document_id": str(created.id), "batch_id": None, "batch_total": 1},
        superseded,
    )


async def _assert_upload_allowed(
    db: AsyncSession, ctx: RequestContext, property_id: uuid.UUID | None,
) -> None:
    """Refuse a ``property_id`` that isn't the caller's, or a used-up daily limit."""
    # Every transaction extracted from the file inherits this property.
    await assert_references_owned(
        db,
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        fields={"property_id": property_id},
    )
    today_count = await usage_log_repo.count_today(db, ctx.organization_id)

    # Demo orgs get a stricter daily upload limit
    is_demo = await demo_repo.is_demo_org(db, ctx.organization_id)
    max_uploads = settings.demo_max_uploads_per_day if is_demo else settings.max_uploads_per_user_per_day
    if today_count >= max_uploads:
        raise ValueError("Daily upload limit reached")


async def _earlier_upload(
    db: AsyncSession, ctx: RequestContext, content: bytes, file_type: str, *, for_update: bool,
) -> tuple[dict[str, str | int | None] | None, list[Document]]:
    """An earlier upload of the same bytes (by content hash).

    Returns its answer if it still stands; otherwise no answer and the failed
    documents it left, which this upload replaces. ``for_update`` locks an
    earlier zip's documents; the check before the upload doesn't lock.
    """
    content_hash = hashlib.sha256(content).hexdigest()
    if file_type == "zip":
        list_batch = (
            document_repo.list_by_batch_content_hash_for_update
            if for_update
            else document_repo.list_by_batch_content_hash
        )
        earlier = await list_batch(db, ctx.organization_id, content_hash)
        if any(d.status != "failed" for d in earlier):
            return _earlier_batch_result(earlier), []
        return None, list(earlier)
    existing = await document_repo.find_by_content_hash(db, ctx.organization_id, content_hash)
    if existing is None:
        return None, []
    if existing.status != "failed":
        return {"document_id": str(existing.id), "batch_id": None, "batch_total": 1, "duplicate": True}, []
    return None, [existing]


def _placeholder(
    ctx: RequestContext,
    file: PreparedDocumentFile,
    property_id: uuid.UUID | None,
    reference_only: bool,
    *,
    content_hash: str | None = None,
    batch_id: str | None = None,
    batch_content_hash: str | None = None,
) -> Document:
    return Document(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        property_id=property_id,
        file_name=file.file_name,
        file_type=file.file_type,
        file_storage_key=file.stored.key,
        file_mime_type=file.stored.content_type,
        content_hash=content_hash,
        source="upload",
        status="processing",
        is_escrow_paid=reference_only,
        batch_id=batch_id,
        batch_content_hash=batch_content_hash,
    )
