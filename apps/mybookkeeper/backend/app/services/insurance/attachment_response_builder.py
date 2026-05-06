"""Inject per-request presigned URLs for insurance-domain attachments.

Single-seam rule: presigned URLs for any object in the insurance domain
are minted ONLY through this module. Each row is HEAD-checked via the
shared ``attach_presigned_url_with_head_check`` helper; missing objects
are flagged ``is_available=False`` so the UI can render a "File missing
— re-upload" affordance.
"""
from __future__ import annotations

from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls(
    attachments: list[InsurancePolicyAttachmentResponse],
) -> list[InsurancePolicyAttachmentResponse]:
    return attach_presigned_url_with_head_check(
        attachments,
        sentry_event_name="insurance_attachment_storage_object_missing",
    )
