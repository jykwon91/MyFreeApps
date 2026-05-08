"""Inject per-request presigned URLs for lease-domain attachments and files.

The single-seam rule (CLAUDE.md): presigned URLs for any object in the
lease domain are minted ONLY through this module. Both lease attachment
rows and lease-template files go through the shared
``attach_presigned_url_with_head_check`` helper, which HEAD-checks each
key and flags ``is_available=False`` when the underlying object is
missing.

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

from app.schemas.leases.lease_template_file_response import (
    LeaseTemplateFileResponse,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.services.leases.lease_filename import friendly_download_filename
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls_to_files(
    files: list[LeaseTemplateFileResponse],
) -> list[LeaseTemplateFileResponse]:
    return attach_presigned_url_with_head_check(
        files,
        sentry_event_name="lease_template_file_storage_object_missing",
    )


def attach_presigned_urls_to_attachments(
    attachments: list[SignedLeaseAttachmentResponse],
) -> list[SignedLeaseAttachmentResponse]:
    return attach_presigned_url_with_head_check(
        attachments,
        sentry_event_name="lease_attachment_storage_object_missing",
        download_filename_resolver=friendly_download_filename,
    )
