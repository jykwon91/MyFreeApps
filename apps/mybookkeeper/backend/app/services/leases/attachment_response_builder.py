"""Inject per-request presigned URLs for lease-domain attachments and files.

The single-seam rule (CLAUDE.md): presigned URLs for any object in the
lease domain are minted ONLY through this module. Two helpers — one for
``LeaseTemplateFileResponse`` rows, one for ``SignedLeaseAttachmentResponse``
rows — share the same signing helper.

Storage is a hard requirement (the lifespan refuses to boot if MinIO is
unreachable). Per-request signing is purely cryptographic and cannot
fail under normal operation; any exception bubbles up so the request
returns 500 with a real stack trace, surfacing the misconfiguration
loudly. Silent ``presigned_url=None`` placeholders for *MinIO outages*
were the source of the PR #201–#204 outage trail and are no longer
permitted on this path.

Distinct from that anti-pattern: when MinIO is up but a *specific
object* is missing (NoSuchKey on HEAD), the corresponding attachment
row is flagged via ``is_available=False`` so the UI can surface a
"File missing — re-upload" affordance instead of an "Open" link that
404s on the user with raw S3 XML. This is a data-integrity signal,
not a service-outage degradation — see ``StorageClient.object_exists``.
"""
from __future__ import annotations

import logging

import sentry_sdk

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.leases.lease_template_file_response import (
    LeaseTemplateFileResponse,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)

logger = logging.getLogger(__name__)


def _sign_one(storage: StorageClient, key: str) -> str:
    return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)


def attach_presigned_urls_to_files(
    files: list[LeaseTemplateFileResponse],
) -> list[LeaseTemplateFileResponse]:
    if not files:
        return files
    storage = get_storage()
    return [
        f.model_copy(update={"presigned_url": _sign_one(storage, f.storage_key)})
        for f in files
    ]


def attach_presigned_urls_to_attachments(
    attachments: list[SignedLeaseAttachmentResponse],
) -> list[SignedLeaseAttachmentResponse]:
    """Mint a presigned URL per attachment, or flag missing objects.

    For each row we ``HEAD`` the underlying object. If MinIO returns
    ``NoSuchKey`` we set ``is_available=False`` and leave ``presigned_url``
    null so the UI can render a re-upload affordance. We also report the
    miss to Sentry (one event per orphan) so the operator has
    observability without a diagnostic API surfacing user data.

    Transient S3 errors propagate as exceptions per ``object_exists``.
    """
    if not attachments:
        return attachments
    storage = get_storage()
    out: list[SignedLeaseAttachmentResponse] = []
    for row in attachments:
        if not storage.object_exists(row.storage_key):
            logger.warning(
                "Lease attachment object missing in storage: lease_id=%s "
                "attachment_id=%s storage_key=%s",
                row.lease_id, row.id, row.storage_key,
            )
            with sentry_sdk.new_scope() as scope:
                scope.set_tag("lease_id", str(row.lease_id))
                scope.set_tag("attachment_id", str(row.id))
                scope.set_extra("storage_key", row.storage_key)
                sentry_sdk.capture_message(
                    "lease_attachment_storage_object_missing",
                    level="warning",
                )
            out.append(row.model_copy(update={
                "presigned_url": None,
                "is_available": False,
            }))
            continue
        out.append(row.model_copy(update={
            "presigned_url": _sign_one(storage, row.storage_key),
            "is_available": True,
        }))
    return out
