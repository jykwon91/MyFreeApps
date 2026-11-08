"""Service layer for blackout notes + file attachments.

Orchestration only: tenant scope checks, size/type validation, storage I/O,
repository writes. No SQL here.

Pipeline for attachment uploads:
    size cap → clean_attachment (type from the bytes, allowlist, photo
    metadata strip) → MinIO upload → DB insert → presigned URL inject

Mirrors the listing-photo pipeline in listing_photo_service.py but with a
broader content-type allowlist (images + PDF + plain text).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from platform_shared.core.storage import StorageNotConfiguredError  # noqa: F401 — re-exported for back-compat

from app.core.config import settings
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.listings import (
    listing_blackout_attachment_repo,
    listing_blackout_repo,
)
from app.schemas.listings.blackout_response import BlackoutResponse
from app.schemas.listings.listing_blackout_attachment_response import (
    ListingBlackoutAttachmentResponse,
)
from app.services.listings.attachment_response_builder import attach_presigned_urls
from app.services.storage.attachment_content import (
    UnreadableImage,
    UnsupportedAttachmentType,
    clean_attachment,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Content-type allowlist
# ---------------------------------------------------------------------------

ALLOWED_ATTACHMENT_MIME_TYPES: frozenset[str] = frozenset({
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
})

_ALLOWED_DISPLAY = ", ".join(sorted(ALLOWED_ATTACHMENT_MIME_TYPES))


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class BlackoutNotFoundError(LookupError):
    """Raised when a blackout is not found or belongs to a different org."""


class AttachmentNotFoundError(LookupError):
    """Raised when an attachment is not found or belongs to a different org."""


class AttachmentTooLargeError(ValueError):
    """Raised when an uploaded file exceeds the size cap."""


class AttachmentTypeRejectedError(ValueError):
    """Raised when the sniffed content type is not in the allowlist."""


# ---------------------------------------------------------------------------
# Notes update
# ---------------------------------------------------------------------------

async def update_notes(
    organization_id: uuid.UUID,
    blackout_id: uuid.UUID,
    host_notes: str | None,
) -> BlackoutResponse:
    """Update host_notes on a blackout. Tenant-scoped; raises BlackoutNotFoundError."""
    async with unit_of_work() as db:
        row = await listing_blackout_repo.get_by_id_scoped_to_organization(
            db,
            blackout_id=blackout_id,
            organization_id=organization_id,
        )
        if row is None:
            raise BlackoutNotFoundError(f"Blackout {blackout_id} not found")
        await listing_blackout_repo.update_notes(
            db,
            blackout_id=blackout_id,
            host_notes=host_notes,
        )
        return BlackoutResponse.model_validate(row)


# ---------------------------------------------------------------------------
# Attachment upload
# ---------------------------------------------------------------------------

async def upload_attachment(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    blackout_id: uuid.UUID,
    content: bytes,
    filename: str,
) -> ListingBlackoutAttachmentResponse:
    """Validate, process, and persist a single attachment.

    Steps:
      1. Tenant scope check — 404 on cross-org.
      2. Size cap — 413 if exceeded.
      3. Content-type sniff (header bytes, not extension).
      4. Allowlist check — 415 if not in allowlist.
      5. Metadata strip (images only) — 415 if the image can't be re-encoded.
      6. MinIO upload.
      7. DB insert.
      8. Return response with presigned URL.
    """
    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    # 1. Tenant scope
    async with unit_of_work() as db:
        blackout = await listing_blackout_repo.get_by_id_scoped_to_organization(
            db,
            blackout_id=blackout_id,
            organization_id=organization_id,
        )
        if blackout is None:
            raise BlackoutNotFoundError(f"Blackout {blackout_id} not found")

    # 2. Size cap
    if len(content) > settings.max_blackout_attachment_size_bytes:
        max_mb = settings.max_blackout_attachment_size_bytes // (1024 * 1024)
        raise AttachmentTooLargeError(f"File exceeds {max_mb}MB limit")

    # 3-5. Type from the bytes, allowlist, photo metadata strip — fail closed
    try:
        cleaned = clean_attachment(content, ALLOWED_ATTACHMENT_MIME_TYPES)
    except UnsupportedAttachmentType as exc:
        raise AttachmentTypeRejectedError(
            f"Unsupported file type (sniffed={exc.sniffed!r}). "
            f"Allowed: {_ALLOWED_DISPLAY}"
        ) from exc
    except UnreadableImage as exc:
        raise AttachmentTypeRejectedError("Couldn't read this image") from exc

    # 6. MinIO upload
    storage_key = f"blackout-attachments/{blackout_id}/{uuid.uuid4()}"
    storage.upload_file(storage_key, cleaned.content, cleaned.storage_content_type)

    # 7. DB insert
    try:
        async with unit_of_work() as db:
            row = await listing_blackout_attachment_repo.create(
                db,
                listing_blackout_id=blackout_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{uuid.uuid4().hex}",
                content_type=cleaned.content_type,
                size_bytes=len(cleaned.content),
                uploaded_by_user_id=user_id,
                uploaded_at=datetime.now(timezone.utc),
            )
            response = ListingBlackoutAttachmentResponse.model_validate(row)
    except Exception:
        # Best-effort cleanup of the just-uploaded object
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete orphan attachment %s after DB error",
                storage_key,
                exc_info=True,
            )
        raise

    return attach_presigned_urls([response])[0]


# ---------------------------------------------------------------------------
# Attachment list
# ---------------------------------------------------------------------------

async def list_attachments(
    organization_id: uuid.UUID,
    blackout_id: uuid.UUID,
) -> list[ListingBlackoutAttachmentResponse]:
    """Return all attachments for a blackout. Tenant-scoped."""
    async with unit_of_work() as db:
        blackout = await listing_blackout_repo.get_by_id_scoped_to_organization(
            db,
            blackout_id=blackout_id,
            organization_id=organization_id,
        )
        if blackout is None:
            raise BlackoutNotFoundError(f"Blackout {blackout_id} not found")

        rows = await listing_blackout_attachment_repo.list_by_blackout(db, blackout_id)

    responses = [ListingBlackoutAttachmentResponse.model_validate(r) for r in rows]
    return attach_presigned_urls(responses)


# ---------------------------------------------------------------------------
# Attachment delete
# ---------------------------------------------------------------------------

async def delete_attachment(
    organization_id: uuid.UUID,
    blackout_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> None:
    """Delete an attachment from DB + best-effort from MinIO. Tenant-scoped."""
    # First confirm the blackout belongs to this org.
    async with unit_of_work() as db:
        blackout = await listing_blackout_repo.get_by_id_scoped_to_organization(
            db,
            blackout_id=blackout_id,
            organization_id=organization_id,
        )
        if blackout is None:
            raise BlackoutNotFoundError(f"Blackout {blackout_id} not found")

        deleted = await listing_blackout_attachment_repo.delete_by_id_scoped_to_blackout(
            db, attachment_id, blackout_id,
        )
        if deleted is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        storage_key = deleted.storage_key

    # Storage cleanup outside the unit_of_work — same pattern as listing photos.
    storage = get_storage()
    if storage is not None:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete attachment object %s from storage",
                storage_key,
                exc_info=True,
            )
