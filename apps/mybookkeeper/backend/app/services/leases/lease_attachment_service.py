"""Attachment management service for signed leases.

Handles upload, list, update (kind / signing state), and delete of
``signed_lease_attachments`` rows.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.services.leases._lease_helpers import (
    ALLOWED_ATTACHMENT_MIME_TYPES,
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    AttachmentTypeRejectedError,
    InvalidAttachmentKindError,
    SignedLeaseNotFoundError,
    StorageNotConfiguredError,
    _attachment_responses,
)
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_attachments,
)
from app.services.leases.lease_template_service import DOCX_MIME

from app.core.lease_enums import LEASE_ATTACHMENT_KINDS

logger = logging.getLogger(__name__)


async def upload_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    content: bytes,
    filename: str,
    declared_content_type: str | None,
    kind: str,
) -> SignedLeaseAttachmentResponse:
    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    from app.core.config import settings as _settings

    if kind not in LEASE_ATTACHMENT_KINDS:
        raise AttachmentTypeRejectedError(f"Invalid kind: {kind}")

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

    if len(content) > _settings.max_blackout_attachment_size_bytes:
        max_mb = _settings.max_blackout_attachment_size_bytes // (1024 * 1024)
        raise AttachmentTooLargeError(f"File exceeds {max_mb}MB limit")

    if declared_content_type and declared_content_type in ALLOWED_ATTACHMENT_MIME_TYPES:
        ct = declared_content_type
    else:
        lower = filename.lower()
        if lower.endswith(".pdf"):
            ct = "application/pdf"
        elif lower.endswith(".docx"):
            ct = DOCX_MIME
        elif lower.endswith(".jpg") or lower.endswith(".jpeg"):
            ct = "image/jpeg"
        elif lower.endswith(".png"):
            ct = "image/png"
        elif lower.endswith(".webp"):
            ct = "image/webp"
        else:
            raise AttachmentTypeRejectedError(
                "Unsupported attachment type. Allowed: pdf, docx, jpg, png, webp",
            )
    if ct not in ALLOWED_ATTACHMENT_MIME_TYPES:
        raise AttachmentTypeRejectedError(
            f"Unsupported attachment type ({ct}). Allowed: pdf, docx, jpg, png, webp",
        )

    attachment_id = uuid.uuid4()
    storage_key = f"signed-leases/{lease_id}/{attachment_id}"
    storage.upload_file(storage_key, content, ct)

    try:
        async with unit_of_work() as db:
            row = await signed_lease_attachment_repo.create(
                db,
                lease_id=lease_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{attachment_id.hex}",
                content_type=ct,
                size_bytes=len(content),
                kind=kind,
                uploaded_by_user_id=user_id,
                uploaded_at=_dt.datetime.now(_dt.timezone.utc),
            )
            response = SignedLeaseAttachmentResponse.model_validate(row)
    except Exception:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to clean up orphan lease attachment %s", storage_key)
        raise

    return attach_presigned_urls_to_attachments([response])[0]


async def list_attachments(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> list[SignedLeaseAttachmentResponse]:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        rows = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
    return _attachment_responses(rows)


async def update_attachment_signing_state(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
    signing_fields: dict[str, _dt.datetime | None],
) -> SignedLeaseAttachmentResponse:
    """Set / clear signing-state timestamps on a lease attachment.

    ``signing_fields`` is the subset of ``{"signed_by_tenant_at",
    "signed_by_landlord_at"}`` the host explicitly set on the request
    body — keys absent from the body are left untouched. ``None`` values
    explicitly clear that party's signature.
    """
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        row = await signed_lease_attachment_repo.update_signing_state_scoped_to_lease(
            db,
            attachment_id=attachment_id,
            lease_id=lease_id,
            fields=signing_fields,
        )
        if row is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")

        response = SignedLeaseAttachmentResponse.model_validate(row)

    return attach_presigned_urls_to_attachments([response])[0]


async def update_attachment_kind(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
    kind: str,
) -> SignedLeaseAttachmentResponse:
    """Change the kind of an existing attachment.

    Validates the kind is in ``LEASE_ATTACHMENT_KINDS``, then applies a
    composite-WHERE update (attachment_id + lease_id) to prevent IDOR.
    """
    if kind not in LEASE_ATTACHMENT_KINDS:
        raise InvalidAttachmentKindError(f"Invalid kind: {kind}")

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        row = await signed_lease_attachment_repo.update_kind_scoped_to_lease(
            db,
            attachment_id=attachment_id,
            lease_id=lease_id,
            kind=kind,
        )
        if row is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")

        response = SignedLeaseAttachmentResponse.model_validate(row)

    return attach_presigned_urls_to_attachments([response])[0]


async def delete_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        deleted = await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
            db, attachment_id, lease_id,
        )
        if deleted is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        storage_key = deleted.storage_key

    storage = get_storage()
    if storage is not None:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete lease attachment object %s",
                storage_key, exc_info=True,
            )
