"""Friendly download filename derivation for lease attachments.

Pure function. The caller (presigned-URL builder) reads the result and
sets it as ``Content-Disposition: attachment; filename="..."`` on the
MinIO presigned URL so the browser saves the file under a human name
instead of the storage-key GUID.

Suffix rules (only applied to the main lease document — kinds
``signed_lease`` and ``rendered_original``):

| signed_by_tenant_at | signed_by_landlord_at | suffix              |
|---------------------|-----------------------|---------------------|
| NULL                | NULL                  | (none)              |
| set                 | NULL                  | " - tenant signed"  |
| NULL                | set                   | " - landlord signed"|
| set                 | set                   | " - fully signed"   |

For all other attachment kinds (inspections, insurance, addenda, etc.)
the original filename is returned unchanged — those documents are not
"signed by tenant / landlord" in the same sense.

The file extension is preserved: a ``.docx`` master template stays
``.docx``, a ``.pdf`` signed lease stays ``.pdf``.
"""
from __future__ import annotations

import datetime as _dt
import os
from typing import Protocol


_LEASE_DOCUMENT_KINDS: frozenset[str] = frozenset({
    "rendered_original",
    "signed_lease",
})


class _AttachmentLike(Protocol):
    """Minimal shape ``friendly_download_filename`` reads.

    Both the SQLAlchemy ORM row (``SignedLeaseAttachment``) and the
    Pydantic response (``SignedLeaseAttachmentResponse``) satisfy this
    protocol via attribute access.
    """

    filename: str
    kind: str
    signed_by_tenant_at: _dt.datetime | None
    signed_by_landlord_at: _dt.datetime | None


def friendly_download_filename(attachment: _AttachmentLike) -> str:
    """Return the human-readable filename to surface on download.

    Pure: depends only on the four fields read from ``attachment``.
    Never raises.
    """
    base_name = attachment.filename or ""

    if attachment.kind not in _LEASE_DOCUMENT_KINDS:
        return base_name

    suffix = _signing_suffix(
        signed_by_tenant_at=attachment.signed_by_tenant_at,
        signed_by_landlord_at=attachment.signed_by_landlord_at,
    )
    if not suffix:
        return base_name

    stem, ext = os.path.splitext(base_name)
    if not stem or base_name.startswith("."):
        # Defensive: filename was just an extension (e.g. ``.docx``,
        # which splitext reads as stem='.docx' ext='') or empty. Don't
        # synthesize a name that would render the dotfile odd.
        return base_name
    return f"{stem}{suffix}{ext}"


def _signing_suffix(
    *,
    signed_by_tenant_at: _dt.datetime | None,
    signed_by_landlord_at: _dt.datetime | None,
) -> str:
    tenant = signed_by_tenant_at is not None
    landlord = signed_by_landlord_at is not None
    if tenant and landlord:
        return " - fully signed"
    if tenant:
        return " - tenant signed"
    if landlord:
        return " - landlord signed"
    return ""
