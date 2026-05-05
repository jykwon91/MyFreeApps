"""Business logic for the Documents domain.

Supports two creation modes:
1. Text-body — ``body`` is supplied; no file upload.
2. File upload — validated bytes stored in MinIO; ``file_path`` set on the row.

All operations are tenant-scoped on ``user_id``.

Storage fail-loud policy: if MinIO is not configured AND the environment is
production (``minio_skip_startup_check=False``), file-upload paths raise
``StorageNotConfiguredError`` which the route maps to HTTP 503.  In test
mode (``minio_skip_startup_check=True``) the storage call is bypassed so
test suites can exercise all other service logic without a running MinIO.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import StorageNotConfiguredError, get_storage
from app.models.application.document import Document
from app.repositories.documents import document_repo
from app.repositories.application import application_repository
from app.schemas.documents.document_create_request import DocumentCreateRequest
from app.schemas.documents.document_response import DocumentResponse
from app.schemas.documents.document_update_request import DocumentUpdateRequest
from app.services.jobs.resume_validator import ResumeRejected, validate_resume

# Allowed MIME types for document uploads (mirrors resume_validator allowlist).
_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
})

# MinIO key prefix for document files.
_DOCUMENT_KEY_PREFIX = "documents"

# Maximum upload size: 25 MB.
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Presigned URL TTL: 1 hour.
_PRESIGNED_URL_TTL_SECONDS = 3600


class ApplicationNotOwnedError(LookupError):
    """Raised when ``application_id`` does not belong to the caller."""


def _to_response(doc: Document) -> DocumentResponse:
    """Map an ORM ``Document`` to a ``DocumentResponse``."""
    return DocumentResponse(
        id=doc.id,
        user_id=doc.user_id,
        application_id=doc.application_id,
        title=doc.title,
        kind=doc.kind,  # type: ignore[arg-type]
        body=doc.body,
        filename=doc.filename,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        has_file=bool(doc.file_path),
        deleted_at=doc.deleted_at,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


async def _verify_application_ownership(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> None:
    """Raise ``ApplicationNotOwnedError`` if the application doesn't belong to the user."""
    app = await application_repository.get_by_id(db, application_id, user_id)
    if app is None:
        raise ApplicationNotOwnedError(
            f"Application {application_id} not found under user {user_id}",
        )


async def create_text_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: DocumentCreateRequest,
) -> DocumentResponse:
    """Persist a text-body-only document (no file upload).

    Validates that ``application_id`` (if supplied) belongs to the caller.
    """
    if request.application_id is not None:
        await _verify_application_ownership(db, user_id, request.application_id)

    doc = Document(
        user_id=user_id,
        application_id=request.application_id,
        title=request.title,
        kind=request.kind,
        body=request.body,
    )
    doc = await document_repo.create(db, doc)
    await db.commit()
    return _to_response(doc)


async def create_file_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    title: str,
    kind: str,
    application_id: uuid.UUID | None,
    file_bytes: bytes,
    filename: str,
    declared_content_type: str,
) -> DocumentResponse:
    """Validate, upload to MinIO, and persist a file-backed document.

    Raises:
        ApplicationNotOwnedError: if ``application_id`` is set but not owned by the user.
        ResumeRejected: on size / content-type validation failure (caller maps to 413/415).
        StorageNotConfiguredError: if MinIO env vars are missing in production.
    """
    if application_id is not None:
        await _verify_application_ownership(db, user_id, application_id)

    sniffed_type = validate_resume(
        file_bytes, declared_content_type, max_bytes=_MAX_UPLOAD_BYTES,
    )

    storage = get_storage()
    key = storage.generate_key(_DOCUMENT_KEY_PREFIX, filename)
    storage.upload_file(key, file_bytes, sniffed_type)

    try:
        doc = Document(
            user_id=user_id,
            application_id=application_id,
            title=title,
            kind=kind,
            file_path=key,
            filename=filename,
            content_type=sniffed_type,
            size_bytes=len(file_bytes),
        )
        doc = await document_repo.create(db, doc)
        await db.commit()
    except Exception:
        # Best-effort cleanup: delete the uploaded object to avoid orphans.
        try:
            storage.delete_file(key)
        except Exception:
            pass
        raise

    return _to_response(doc)


async def get_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
) -> DocumentResponse | None:
    """Return a single non-deleted document owned by the user, or None."""
    doc = await document_repo.get_by_id_for_user(db, document_id, user_id)
    if doc is None:
        return None
    return _to_response(doc)


async def list_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    application_id: uuid.UUID | None = None,
    kind: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[DocumentResponse]:
    """List non-deleted documents owned by the user with optional filters."""
    docs = await document_repo.list_for_user(
        db,
        user_id,
        application_id=application_id,
        kind=kind,
        limit=limit,
        offset=offset,
    )
    return [_to_response(d) for d in docs]


async def list_by_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[DocumentResponse] | None:
    """Return documents linked to an application, or None if the application isn't found.

    Returns ``None`` (not an empty list) when the application doesn't exist under
    the user — the route layer maps this to HTTP 404 with no existence leak.
    """
    app = await application_repository.get_by_id(db, application_id, user_id)
    if app is None:
        return None
    docs = await document_repo.list_by_application(db, user_id, application_id)
    return [_to_response(d) for d in docs]


async def update_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    request: DocumentUpdateRequest,
) -> DocumentResponse | None:
    """Apply PATCH updates to a document.

    Returns None if the document is not found or doesn't belong to the user.
    Raises ``ApplicationNotOwnedError`` if the new ``application_id`` is set but
    not owned by the caller.
    """
    doc = await document_repo.get_by_id_for_user(db, document_id, user_id)
    if doc is None:
        return None

    updates = request.to_update_dict()

    # Verify the new application_id if it's being changed.
    if "application_id" in updates and updates["application_id"] is not None:
        await _verify_application_ownership(db, user_id, updates["application_id"])

    doc = await document_repo.update(db, doc, updates)
    await db.commit()
    return _to_response(doc)


async def soft_delete_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
) -> bool:
    """Soft-delete a document. Returns True if found, False if not found.

    Idempotent — a second soft-delete on the same document returns True.
    """
    doc = await document_repo.get_by_id_for_user(
        db, document_id, user_id, include_deleted=True,
    )
    if doc is None:
        return False

    await document_repo.soft_delete(db, doc)
    await db.commit()
    return True


async def presigned_download_url(
    db: AsyncSession,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
) -> str | None:
    """Return a presigned download URL for the document's file.

    Returns None if the document is not found, doesn't belong to the user,
    or has no associated file (text-body-only document).
    Raises ``StorageNotConfiguredError`` if MinIO env vars are missing.
    """
    doc = await document_repo.get_by_id_for_user(db, document_id, user_id)
    if doc is None or not doc.file_path:
        return None
    storage = get_storage()
    return storage.generate_presigned_url(doc.file_path, _PRESIGNED_URL_TTL_SECONDS)
