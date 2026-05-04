"""Inject per-request presigned URLs for lease-domain attachments and files.

The single-seam rule (CLAUDE.md): presigned URLs for any object in the
lease domain are minted ONLY through this module. Two helpers — one for
``LeaseTemplateFileResponse`` rows, one for ``SignedLeaseAttachmentResponse``
rows — share the same signing helper.

Storage is a hard requirement (the lifespan refuses to boot if MinIO is
unreachable). Per-request signing is purely cryptographic and cannot
fail under normal operation; any exception bubbles up so the request
returns 500 with a real stack trace, surfacing the misconfiguration
loudly. Silent ``presigned_url=None`` placeholders were the source of
the PR #201–#204 outage trail and are no longer permitted on this path.
"""
from __future__ import annotations

from typing import TypeVar

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.leases.lease_template_file_response import (
    LeaseTemplateFileResponse,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)

_T = TypeVar("_T", LeaseTemplateFileResponse, SignedLeaseAttachmentResponse)


def _sign_one(storage: StorageClient, key: str) -> str:
    return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)


def _attach(rows: list[_T]) -> list[_T]:
    if not rows:
        return rows
    storage = get_storage()
    return [
        r.model_copy(update={"presigned_url": _sign_one(storage, r.storage_key)})
        for r in rows
    ]


def attach_presigned_urls_to_files(
    files: list[LeaseTemplateFileResponse],
) -> list[LeaseTemplateFileResponse]:
    return _attach(files)


def attach_presigned_urls_to_attachments(
    attachments: list[SignedLeaseAttachmentResponse],
) -> list[SignedLeaseAttachmentResponse]:
    return _attach(attachments)
