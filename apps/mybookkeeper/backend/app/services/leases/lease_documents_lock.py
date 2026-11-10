"""When a lease's documents stop changing.

A lease's documents are locked once it has left draft/generated, has been
emailed to the tenant, or holds a signed copy (any ``signed_lease`` file, or a
rendered original the tenant signed). From then on the rendered originals and
signed files are the record of what the tenant was given, so they are not
re-rendered. A record file is only deleted or relabelled if it was added after
the lock point (a stamp, or the first signed copy) and has not been emailed
since, so a mistaken later upload can go; a signature on a locked file cannot
be cleared or changed.
Callers check under the lease row lock.
"""
from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import as_utc
from app.core.lease_enums import LEASE_DOCUMENT_RERENDER_STATUSES, LEASE_RECORD_ATTACHMENT_KINDS
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.repositories.leases import signed_lease_attachment_repo
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError

NEW_ORIGINAL_KIND = "rendered_original"


def is_lease_state_locked(lease: SignedLease) -> bool:
    """Locked by the lease row itself: past generated, or already in the tenant's inbox."""
    return (
        lease.status not in LEASE_DOCUMENT_RERENDER_STATUSES
        or lease.last_emailed_to_tenant_at is not None
    )


def _holds_signed_copy(attachment: SignedLeaseAttachment) -> bool:
    return attachment.kind == "signed_lease" or (
        attachment.kind == "rendered_original" and attachment.signed_by_tenant_at is not None
    )


def is_lease_documents_locked(lease: SignedLease, attachments: Sequence[SignedLeaseAttachment]) -> bool:
    return is_lease_state_locked(lease) or any(_holds_signed_copy(a) for a in attachments)


def _lock_point(lease: SignedLease, attachments: Sequence[SignedLeaseAttachment]) -> _dt.datetime | None:
    """The earliest moment the lease's documents became the record: a stamp, or the first signed copy."""
    stamps = [t for t in (lease.sent_at, lease.signed_at, lease.last_emailed_to_tenant_at) if t is not None]
    stamps += [a.uploaded_at for a in attachments if _holds_signed_copy(a)]
    return min(as_utc(t) for t in stamps) if stamps else None


def _locked_through(lease: SignedLease, attachments: Sequence[SignedLeaseAttachment]) -> _dt.datetime | None:
    """Files uploaded at or before this moment are the record.

    That is the lock point, the first signed copy (the record even when the
    lease was emailed before it arrived), the signing time and the last email.
    """
    first_signed = min((a.uploaded_at for a in attachments if _holds_signed_copy(a)), default=None)
    moments = [_lock_point(lease, attachments), lease.signed_at, lease.last_emailed_to_tenant_at, first_signed]
    known = [as_utc(m) for m in moments if m is not None]
    return max(known) if known else None


def is_record_file_locked(
    lease: SignedLease, attachments: Sequence[SignedLeaseAttachment], attachment: SignedLeaseAttachment,
) -> bool:
    """A record file stays unless it was added after everything that made it the record.

    The first signed copy and everything before it are the record; a later
    signed copy can still be removed if it was a mistake. An original the
    tenant signed is always locked.
    """
    if attachment.kind not in LEASE_RECORD_ATTACHMENT_KINDS:
        return False
    if attachment.kind == NEW_ORIGINAL_KIND and attachment.signed_by_tenant_at is not None:
        return True
    if not is_lease_documents_locked(lease, attachments):
        return False
    through = _locked_through(lease, attachments)
    return through is None or as_utc(attachment.uploaded_at) <= through


async def lease_documents_locked(db: AsyncSession, lease: SignedLease) -> bool:
    if is_lease_state_locked(lease):
        return True
    return is_lease_documents_locked(lease, await signed_lease_attachment_repo.list_by_lease(db, lease.id))


async def ensure_documents_rerenderable(db: AsyncSession, lease: SignedLease) -> None:
    if await lease_documents_locked(db, lease):
        raise LeaseDocumentsLockedError(
            f"Lease {lease.id} is {lease.status}; its documents can no longer be re-rendered"
        )


def ensure_attachment_change_allowed(
    lease: SignedLease,
    attachments: Sequence[SignedLeaseAttachment],
    attachment: SignedLeaseAttachment,
    *,
    new_kind: str | None,
) -> None:
    """Refuse deleting (``new_kind`` None) or relabelling a locked record file, or relabelling anything into the record."""
    if new_kind == attachment.kind:
        return
    if new_kind in LEASE_RECORD_ATTACHMENT_KINDS and is_lease_documents_locked(lease, attachments):
        raise LeaseAttachmentLockedError(f"Lease {lease.id} is locked; no file can be relabelled into the record")
    if is_record_file_locked(lease, attachments, attachment):
        raise LeaseAttachmentLockedError(f"Lease {lease.id} is locked; its {attachment.kind} files cannot change")


def ensure_original_upload_allowed(lease: SignedLease, attachments: Sequence[SignedLeaseAttachment], *, kind: str) -> None:
    if kind == NEW_ORIGINAL_KIND and is_lease_documents_locked(lease, attachments):
        raise LeaseAttachmentLockedError(f"Lease {lease.id} is locked; no more originals can be uploaded")


def ensure_signing_change_allowed(
    lease: SignedLease,
    attachments: Sequence[SignedLeaseAttachment],
    attachment: SignedLeaseAttachment,
    signing_fields: Mapping[str, _dt.datetime | None],
) -> None:
    """Refuse clearing or changing a signature that is part of the record; adding one is always fine."""
    if not is_record_file_locked(lease, attachments, attachment):
        return
    for name, new in signing_fields.items():
        saved = getattr(attachment, name)
        if saved is not None and (new is None or as_utc(new) != as_utc(saved)):
            raise LeaseAttachmentLockedError(f"Lease {lease.id} is locked; the signature on this file cannot change")
