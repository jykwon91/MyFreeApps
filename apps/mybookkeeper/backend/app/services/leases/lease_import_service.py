"""Import service for externally-signed leases (uploaded PDFs).

Handles the ``import_signed_lease`` flow: validate files, create the lease
row (kind='imported'), upload attachments to MinIO, and return the detail.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.repositories.listings import listing_repo
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    ALLOWED_ATTACHMENT_MIME_TYPES,
    AttachmentTooLargeError,
    AttachmentTypeRejectedError,
    StorageNotConfiguredError,
    _validate_parent_lease,
)
from app.services.leases.lease_lifecycle_service import get_lease

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions specific to import
# ---------------------------------------------------------------------------

class ApplicantNotFoundError(LookupError):
    pass


class ListingNotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# Attachment-kind heuristic (public — used by the import API and tests)
# ---------------------------------------------------------------------------

def infer_kind_from_filename(filename: str) -> str:
    """Infer the attachment kind from a filename using pattern matching.

    Order of evaluation (case-insensitive):
    1. "move-in inspection" / "move in inspection" → move_in_inspection
    2. "move-out inspection" / "move out inspection" → move_out_inspection
    3. "lease agreement" / "master lease" / "rental agreement" → signed_lease
    4. "inspection" (without "move") → move_in_inspection (default to in if ambiguous)
    5. "insurance" → insurance_proof
    6. Everything else → signed_addendum
    """
    lower = filename.lower()

    if "move-in inspection" in lower or "move in inspection" in lower:
        return "move_in_inspection"
    if "move-out inspection" in lower or "move out inspection" in lower:
        return "move_out_inspection"
    if "lease agreement" in lower or "master lease" in lower or "rental agreement" in lower:
        return "signed_lease"
    if "inspection" in lower:
        return "move_in_inspection"
    if "insurance" in lower:
        return "insurance_proof"
    return "signed_addendum"


def infer_kinds_for_files(filenames: list[str]) -> list[str]:
    """Infer a kind for each filename in a batch.

    Applies ``infer_kind_from_filename`` to each file. If none of the
    inferred kinds is ``signed_lease``, the first file is promoted to
    ``signed_lease`` as a last-resort fallback so every batch has at
    least one main lease.
    """
    kinds = [infer_kind_from_filename(name) for name in filenames]
    if "signed_lease" not in kinds and filenames:
        kinds[0] = "signed_lease"
    return kinds


def _infer_attachment_kind(filename: str, position: int) -> str:
    """Position-aware heuristic for multi-file import batches.

    The FIRST file is always signed_lease. Subsequent files check the
    filename for "move" + "in" → move_in_inspection, or "move" + "out" →
    move_out_inspection. Everything else is signed_addendum.
    """
    if position == 0:
        return "signed_lease"
    lower = filename.lower()
    if "move" in lower and "out" in lower:
        return "move_out_inspection"
    if "move" in lower and "in" in lower:
        return "move_in_inspection"
    return "signed_addendum"


# ---------------------------------------------------------------------------
# Content-type resolution + EXIF strip
# ---------------------------------------------------------------------------

def _resolve_content_type(
    content: bytes, filename: str, declared: str | None,
) -> str | None:
    """Return a validated MIME type or None if not in the allowlist."""
    if declared and declared in ALLOWED_ATTACHMENT_MIME_TYPES:
        return declared
    lower = filename.lower()
    ext_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    for ext, ct in ext_map.items():
        if lower.endswith(ext):
            return ct
    return None


def _exif_strip_image(content: bytes, content_type: str) -> bytes:
    """EXIF-strip an image via Pillow. Returns cleaned bytes."""
    from app.services.storage.image_processor import process_image, ImageRejected
    try:
        result = process_image(content, declared_content_type=content_type)
        return result.content
    except ImageRejected:
        return content


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

async def import_signed_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    starts_on: _dt.date | None,
    ends_on: _dt.date | None,
    notes: str | None,
    status: str,
    files: list[tuple[bytes, str, str | None]],  # (content, filename, declared_ct)
    parent_lease_id: uuid.UUID | None = None,
) -> SignedLeaseResponse:
    """Create an imported signed lease from externally-signed PDFs.

    Unlike ``create_lease``, this path does NOT require a template. The lease
    is created with ``kind='imported'``, no template links, and
    ``signed_at=now()`` since by definition the documents are already signed.

    ``files`` is an ordered list of ``(content_bytes, filename, content_type)``
    tuples. The first file becomes ``kind=signed_lease``; subsequent files use
    the ``_infer_attachment_kind`` heuristic.
    """
    from app.core.config import settings as _settings

    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    processed: list[tuple[bytes, str, str]] = []
    for content, filename, declared_ct in files:
        if len(content) > _settings.max_blackout_attachment_size_bytes:
            max_mb = _settings.max_blackout_attachment_size_bytes // (1024 * 1024)
            raise AttachmentTooLargeError(f"File '{filename}' exceeds {max_mb}MB limit")
        ct = _resolve_content_type(content, filename, declared_ct)
        if ct is None:
            raise AttachmentTypeRejectedError(
                f"Unsupported file type for '{filename}'. "
                "Allowed: pdf, docx, jpg, png, webp",
            )
        if ct in ("image/jpeg", "image/png", "image/webp"):
            content = _exif_strip_image(content, ct)
        processed.append((content, filename, ct))

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise ApplicantNotFoundError(f"Applicant {applicant_id} not found")

        if listing_id is not None:
            listing = await listing_repo.get_by_id(
                db,
                listing_id=listing_id,
                organization_id=organization_id,
            )
            if listing is None:
                raise ListingNotFoundError(f"Listing {listing_id} not found")

        if parent_lease_id is not None:
            await _validate_parent_lease(
                db,
                parent_lease_id=parent_lease_id,
                user_id=user_id,
                organization_id=organization_id,
            )

        now = _dt.datetime.now(_dt.timezone.utc)
        lease = await signed_lease_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            values={},
            starts_on=starts_on,
            ends_on=ends_on,
            status=status,
            kind="imported",
            parent_lease_id=parent_lease_id,
        )
        await signed_lease_repo.update_lease(
            db,
            lease_id=lease.id,
            user_id=user_id,
            organization_id=organization_id,
            fields={"signed_at": now, "notes": notes},
        )
        lease_id = lease.id

    uploaded: list[str] = []
    try:
        async with unit_of_work() as db:
            now = _dt.datetime.now(_dt.timezone.utc)
            for position, (content, filename, ct) in enumerate(processed):
                attachment_id = uuid.uuid4()
                storage_key = f"signed-leases/{lease_id}/{attachment_id}"
                storage.upload_file(storage_key, content, ct)
                uploaded.append(storage_key)
                kind = _infer_attachment_kind(filename, position)
                await signed_lease_attachment_repo.create(
                    db,
                    lease_id=lease_id,
                    storage_key=storage_key,
                    filename=filename or f"attachment-{attachment_id.hex}",
                    content_type=ct,
                    size_bytes=len(content),
                    kind=kind,
                    uploaded_by_user_id=user_id,
                    uploaded_at=now,
                )
    except Exception:
        for storage_key in uploaded:
            try:
                storage.delete_file(storage_key)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to clean up import attachment %s", storage_key)
        raise

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
