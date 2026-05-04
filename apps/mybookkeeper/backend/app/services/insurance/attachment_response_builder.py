"""Inject per-request presigned URLs for insurance-domain attachments.

The single-seam rule (CLAUDE.md): presigned URLs for any object in the
insurance domain are minted ONLY through this module.

Storage is a hard requirement (the lifespan refuses to boot if MinIO is
unreachable). Per-request signing is purely cryptographic and cannot fail
under normal operation; any exception bubbles up so the request returns 500
with a real stack trace, surfacing the misconfiguration loudly.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.storage import get_storage
from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)


def attach_presigned_urls(
    attachments: list[InsurancePolicyAttachmentResponse],
) -> list[InsurancePolicyAttachmentResponse]:
    if not attachments:
        return attachments
    storage = get_storage()
    return [
        a.model_copy(
            update={
                "presigned_url": storage.generate_presigned_url(
                    a.storage_key, settings.presigned_url_ttl_seconds
                )
            }
        )
        for a in attachments
    ]
