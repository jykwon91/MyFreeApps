"""Attachment management service for signed leases.

Handles upload, list, update (kind / signing state), and delete of
``signed_lease_attachments`` rows.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as _settings
from app.core.lease_enums import LEASE_ATTACHMENT_KINDS
from app.core.storage import get_storage
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_term_version_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.services.leases._lease_helpers import (
    ALLOWED_ATTACHMENT_MIME_TYPES,
    AttachmentBacksExtensionError,
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    AttachmentTypeRejectedError,
    InvalidAttachmentKindError,
    SignedLeaseNotFoundError,
    StorageNotConfiguredError,
    _attachment_response,
    _attachment_responses,
)
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_attachments,
)
from app.services.leases.lease_documents_lock import (
    ensure_attachment_change_allowed,
    ensure_original_upload_allowed,
    ensure_signing_change_allowed,
)
from app.services.storage.attachment_content import (
    UnreadableImage,
    UnsupportedAttachmentType,
    clean_attachment,
)

logger = logging.getLogger(__name__)


async def upload_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    content: bytes,
    filename: str,
    kind: str,
) -> SignedLeaseAttachmentResponse:
    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

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
        await _ensure_original_upload_allowed(db, lease, kind)

    if len(content) > _settings.max_blackout_attachment_size_bytes:
        max_mb = _settings.max_blackout_attachment_size_bytes // (1024 * 1024)
        raise AttachmentTooLargeError(f"File exceeds {max_mb}MB limit")

    try:
        cleaned = await asyncio.to_thread(clean_attachment, content, ALLOWED_ATTACHMENT_MIME_TYPES)
    except UnsupportedAttachmentType as exc:
        raise AttachmentTypeRejectedError(
            "Unsupported attachment type. Allowed: pdf, docx, jpg, png, webp",
        ) from exc
    except UnreadableImage as exc:
        raise AttachmentTypeRejectedError("Couldn't read this image") from exc

    attachment_id = uuid.uuid4()
    storage_key = f"signed-leases/{lease_id}/{attachment_id}"
    storage.upload_file(storage_key, cleaned.content, cleaned.content_type)

    try:
        async with unit_of_work() as db:
            locked_lease = await signed_lease_repo.get(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                for_update=True,
            )
            if locked_lease is None:
                raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
            await _ensure_original_upload_allowed(db, locked_lease, kind)
            row = await signed_lease_attachment_repo.create(
                db,
                lease_id=lease_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{attachment_id.hex}",
                content_type=cleaned.content_type,
                size_bytes=len(cleaned.content),
                kind=kind,
                uploaded_by_user_id=user_id,
                uploaded_at=_dt.datetime.now(_dt.timezone.utc),
            )
            response = await _response_for(db, locked_lease, row)
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
    return _attachment_responses(rows, lease)


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
            for_update=True,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        saved = await signed_lease_attachment_repo.get_by_id(db, attachment_id)
        if saved is None or saved.lease_id != lease_id:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        attachments = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
        ensure_signing_change_allowed(lease, attachments, saved, signing_fields)

        row = await signed_lease_attachment_repo.update_signing_state_scoped_to_lease(
            db,
            attachment_id=attachment_id,
            lease_id=lease_id,
            fields=signing_fields,
        )
        if row is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")

        response = await _response_for(db, lease, row)

    return attach_presigned_urls_to_attachments([response])[0]


async def _refuse_if_backing_extension(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> None:
    """Deleting nulls the foreign key, and a term version with no attachment reads as the original term."""
    if await lease_term_version_repo.attachment_backs_live_version(
        db, lease_id=lease_id, attachment_id=attachment_id,
    ):
        raise AttachmentBacksExtensionError(
            f"Attachment {attachment_id} backs a live extension",
        )


async def _response_for(db: AsyncSession, lease: SignedLease, row: SignedLeaseAttachment) -> SignedLeaseAttachmentResponse:
    """The file as the lease now stands, so ``is_locked`` is never guessed."""
    return _attachment_response(row, lease, await signed_lease_attachment_repo.list_by_lease(db, lease.id))


async def _ensure_original_upload_allowed(db: AsyncSession, lease: SignedLease, kind: str) -> None:
    """No more rendered originals can appear on a lease whose documents are the record."""
    ensure_original_upload_allowed(lease, await signed_lease_attachment_repo.list_by_lease(db, lease.id), kind=kind)


async def _ensure_change_allowed(
    db: AsyncSession,
    lease: SignedLease,
    *,
    attachment_id: uuid.UUID,
    new_kind: str | None,
) -> None:
    """On a locked lease the original and signed files are the record (the lease row is already locked)."""
    row = await signed_lease_attachment_repo.get_by_id(db, attachment_id)
    if row is None or row.lease_id != lease.id:
        raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
    attachments = await signed_lease_attachment_repo.list_by_lease(db, lease.id)
    ensure_attachment_change_allowed(lease, attachments, row, new_kind=new_kind)


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
            for_update=True,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        # Regenerate deletes every rendered_original, so a new kind could
        # delete an addendum by the back door. This is the more specific
        # reason, so it is told before the lease-wide lock.
        await _refuse_if_backing_extension(db, lease_id=lease_id, attachment_id=attachment_id)
        await _ensure_change_allowed(db, lease, attachment_id=attachment_id, new_kind=kind)

        row = await signed_lease_attachment_repo.update_kind_scoped_to_lease(
            db,
            attachment_id=attachment_id,
            lease_id=lease_id,
            kind=kind,
        )
        if row is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")

        response = await _response_for(db, lease, row)

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
            for_update=True,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        await _refuse_if_backing_extension(db, lease_id=lease_id, attachment_id=attachment_id)
        await _ensure_change_allowed(db, lease, attachment_id=attachment_id, new_kind=None)
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
