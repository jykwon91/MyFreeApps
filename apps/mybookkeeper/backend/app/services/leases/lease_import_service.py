"""Import service for externally-signed leases (uploaded PDFs).

Handles the ``import_signed_lease`` flow: validate files, create the lease
row (kind='imported'), upload attachments to MinIO, and return the detail.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import uuid

from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.committed_write_guard import CommittedWriteGuard
from platform_shared.services.storage.object_upload import upload_objects

from app.core.config import settings as _settings
from app.core.storage import get_storage
from app.core.upload_size_messages import attachment_too_large_message
from app.db.session import unit_of_work
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    ALLOWED_ATTACHMENT_MIME_TYPES,
    AttachmentTooLargeError,
    AttachmentTypeRejectedError,
    SignedLeaseNotFoundError,
    _validate_parent_lease,
)
from app.services.leases.lease_attachments_present import attachments_present_check
from app.services.leases.lease_lifecycle_service import get_lease
from app.services.leases.lease_references import resolve_lease_listing_id
from app.services.storage.attachment_content import (
    UnreadableImage,
    UnsupportedAttachmentType,
    clean_attachment,
)


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
    files: list[tuple[bytes, str]],  # (content, filename)
    parent_lease_id: uuid.UUID | None = None,
) -> SignedLeaseResponse:
    """Create an imported signed lease from externally-signed PDFs.

    Unlike ``create_lease``, this path does NOT require a template. The lease
    is created with ``kind='imported'``, no template links, and
    ``signed_at=now()`` since by definition the documents are already signed.

    ``files`` is an ordered list of ``(content_bytes, filename)`` tuples; each
    file's type comes from its bytes. The first file becomes
    ``kind=signed_lease``; subsequent files use the ``_infer_attachment_kind``
    heuristic.
    """
    storage = get_storage()

    processed: list[tuple[bytes, str, str]] = []
    for content, filename in files:
        if len(content) > _settings.max_blackout_attachment_size_bytes:
            raise AttachmentTooLargeError(attachment_too_large_message(f"File '{filename}'"))
        try:
            cleaned = await asyncio.to_thread(clean_attachment, content, ALLOWED_ATTACHMENT_MIME_TYPES)
        except UnsupportedAttachmentType as exc:
            raise AttachmentTypeRejectedError(
                f"Unsupported file type for '{filename}'. "
                "Allowed: pdf, docx, jpg, png, webp",
            ) from exc
        except UnreadableImage as exc:
            raise AttachmentTypeRejectedError(f"Couldn't read the image '{filename}'") from exc
        processed.append((cleaned.content, filename, cleaned.content_type))

    # One moment for the lease's signed_at and every file's uploaded_at: the files are the lock point itself.
    now = _dt.datetime.now(_dt.timezone.utc)
    async with unit_of_work() as db:
        listing_id = await resolve_lease_listing_id(
            db,
            applicant_id=applicant_id,
            listing_id=listing_id,
            organization_id=organization_id,
            user_id=user_id,
        )

        if parent_lease_id is not None:
            await _validate_parent_lease(
                db,
                parent_lease_id=parent_lease_id,
                user_id=user_id,
                organization_id=organization_id,
            )

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

    attachment_ids = [uuid.uuid4() for _ in processed]
    objects = [
        NewStoredObject(f"signed-leases/{lease_id}/{attachment_id}", content, ct)
        for attachment_id, (content, _filename, ct) in zip(attachment_ids, processed)
    ]
    keys = [obj.key for obj in objects]
    await upload_objects(storage, objects)

    async with CommittedWriteGuard(
        storage, keys, attachments_present_check(lease_id, user_id, organization_id, keys),
    ) as guard:
        async with unit_of_work() as db:
            # Locked and checked again: the lease may have been deleted during the upload.
            locked = await signed_lease_repo.get(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                for_update=True,
            )
            if locked is None:
                raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
            for position, (attachment_id, obj, (content, filename, ct)) in enumerate(
                zip(attachment_ids, objects, processed),
            ):
                await signed_lease_attachment_repo.create(
                    db,
                    lease_id=lease_id,
                    storage_key=obj.key,
                    filename=filename or f"attachment-{attachment_id.hex}",
                    content_type=ct,
                    size_bytes=len(content),
                    kind=_infer_attachment_kind(filename, position),
                    uploaded_by_user_id=user_id,
                    uploaded_at=now,
                )
            guard.rows_written()

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
