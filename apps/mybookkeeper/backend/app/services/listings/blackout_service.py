"""Service layer for blackout notes + file attachments.

Orchestration only: tenant scope checks, size/type validation, storage I/O,
repository writes. No SQL here.

Pipeline for attachment uploads:
    size cap → content-type sniff (header bytes) → allowlist check →
    EXIF strip (images only) → MinIO upload → DB insert → presigned URL inject

Mirrors the listing-photo pipeline in listing_photo_service.py but with a
broader content-type allowlist (images + PDF + plain text).
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.listings import listing_blackout_repo
from app.repositories.listings import listing_blackout_attachment_repo
from app.schemas.listings.blackout_response import BlackoutResponse
from app.schemas.listings.listing_blackout_attachment_response import (
    ListingBlackoutAttachmentResponse,
)
from app.services.listings.attachment_response_builder import attach_presigned_urls

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


class StorageNotConfiguredError(RuntimeError):
    """Raised when MinIO/S3 storage is not configured."""


# ---------------------------------------------------------------------------
# Content-type sniffing
# ---------------------------------------------------------------------------

def _sniff_content_type(content: bytes) -> str | None:
    """Return the sniffed MIME type via header-byte inspection.

    Covers the attachment allowlist only. Returns None if unrecognised.
    """
    if len(content) < 8:
        return None

    # JPEG: FF D8 FF
    if content[0:3] == b"\xff\xd8\xff":
        return "image/jpeg"

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if content[0:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # WebP: RIFF....WEBP
    if content[0:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"

    # GIF: GIF87a or GIF89a
    if content[0:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"

    # PDF: %PDF
    if content[0:4] == b"%PDF":
        return "application/pdf"

    # Plain text: heuristic — if the first 512 bytes are all printable ASCII
    # or common whitespace, call it text/plain.
    sample = content[:512]
    if all(0x09 <= b <= 0x7E or b in (0x0A, 0x0D) for b in sample):
        return "text/plain"

    return None


# ---------------------------------------------------------------------------
# EXIF strip helper (images only)
# ---------------------------------------------------------------------------

def _strip_exif_if_image(content: bytes, content_type: str) -> bytes:
    """Strip EXIF metadata from JPEG/PNG/WebP images via Pillow.

    Non-image types (PDF, plain text) pass through unchanged. Mirrors the
    approach in services/storage/image_processor.py.
    """
    if content_type not in ("image/jpeg", "image/png", "image/webp"):
        return content

    try:
        from PIL import Image  # type: ignore[import-untyped]

        with Image.open(io.BytesIO(content)) as img:
            img.load()
            buf = io.BytesIO()
            fmt = img.format or ("JPEG" if content_type == "image/jpeg" else "PNG")
            save_kwargs: dict[str, object] = {"format": fmt}
            if fmt == "JPEG":
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True
                save_kwargs["exif"] = b""
            img.save(buf, **save_kwargs)
            return buf.getvalue()
    except Exception:  # noqa: BLE001
        logger.warning("EXIF strip failed — uploading original bytes", exc_info=True)
        return content


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
    declared_content_type: str | None,
) -> ListingBlackoutAttachmentResponse:
    """Validate, process, and persist a single attachment.

    Steps:
      1. Tenant scope check — 404 on cross-org.
      2. Size cap — 413 if exceeded.
      3. Content-type sniff (header bytes, not extension).
      4. Allowlist check — 415 if not in allowlist.
      5. EXIF strip (images only).
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

    # 3+4. Content-type sniff + allowlist
    sniffed = _sniff_content_type(content)
    if sniffed is None or sniffed not in ALLOWED_ATTACHMENT_MIME_TYPES:
        raise AttachmentTypeRejectedError(
            f"Unsupported file type (sniffed={sniffed!r}). "
            f"Allowed: {_ALLOWED_DISPLAY}"
        )

    # 5. EXIF strip
    clean_content = _strip_exif_if_image(content, sniffed)

    # 6. MinIO upload
    storage_key = f"blackout-attachments/{blackout_id}/{uuid.uuid4()}"
    storage.upload_file(storage_key, clean_content, sniffed)

    # 7. DB insert
    try:
        async with unit_of_work() as db:
            row = await listing_blackout_attachment_repo.create(
                db,
                listing_blackout_id=blackout_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{uuid.uuid4().hex}",
                content_type=sniffed,
                size_bytes=len(clean_content),
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

        deleted = await listing_blackout_attachment_repo.delete_by_id(db, attachment_id)
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
