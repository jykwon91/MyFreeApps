"""Service layer for insurance policies.

Handles CRUD + attachment upload/delete for the insurance domain.

All data access is through repositories; never imports SQLAlchemy in this
module.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from typing import Any

from app.core.config import settings as _settings
from app.core.insurance_enums import INSURANCE_ATTACHMENT_KINDS
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.insurance import (
    insurance_policy_attachment_repo,
    insurance_policy_repo,
)
from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.schemas.insurance.insurance_policy_list_response import (
    InsurancePolicyListResponse,
)
from app.schemas.insurance.insurance_policy_response import InsurancePolicyResponse
from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
from app.services.insurance.attachment_response_builder import attach_presigned_urls

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class InsurancePolicyNotFoundError(LookupError):
    pass


class AttachmentNotFoundError(LookupError):
    pass


class AttachmentTooLargeError(ValueError):
    pass


class AttachmentTypeRejectedError(ValueError):
    pass


class InvalidAttachmentKindError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Allowed MIME types for insurance attachments.
# ---------------------------------------------------------------------------

ALLOWED_ATTACHMENT_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
})

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _attachment_responses(
    rows: list,
) -> list[InsurancePolicyAttachmentResponse]:
    return attach_presigned_urls(
        [InsurancePolicyAttachmentResponse.model_validate(r) for r in rows],
    )


def _to_detail(policy, attachments: list) -> InsurancePolicyResponse:
    return InsurancePolicyResponse(
        id=policy.id,
        user_id=policy.user_id,
        organization_id=policy.organization_id,
        listing_id=policy.listing_id,
        policy_name=policy.policy_name,
        carrier=policy.carrier,
        policy_number=policy.policy_number,
        effective_date=policy.effective_date,
        expiration_date=policy.expiration_date,
        coverage_amount_cents=policy.coverage_amount_cents,
        notes=policy.notes,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
        attachments=_attachment_responses(attachments),
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_policy(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    listing_id: uuid.UUID,
    policy_name: str,
    carrier: str | None,
    policy_number: str | None,
    effective_date: _dt.date | None,
    expiration_date: _dt.date | None,
    coverage_amount_cents: int | None,
    notes: str | None,
) -> InsurancePolicyResponse:
    async with unit_of_work() as db:
        policy = await insurance_policy_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            listing_id=listing_id,
            policy_name=policy_name,
            carrier=carrier,
            policy_number=policy_number,
            effective_date=effective_date,
            expiration_date=expiration_date,
            coverage_amount_cents=coverage_amount_cents,
            notes=notes,
        )
    return _to_detail(policy, [])


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

async def list_policies(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    listing_id: uuid.UUID | None = None,
    expiring_before: _dt.date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> InsurancePolicyListResponse:
    async with unit_of_work() as db:
        rows = await insurance_policy_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            listing_id=listing_id,
            expiring_before=expiring_before,
            limit=limit,
            offset=offset,
        )
        total = await insurance_policy_repo.count_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            listing_id=listing_id,
            expiring_before=expiring_before,
        )
    items = [InsurancePolicySummary.model_validate(r) for r in rows]
    return InsurancePolicyListResponse(
        items=items, total=total, has_more=(offset + len(items)) < total,
    )


async def get_policy(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    policy_id: uuid.UUID,
) -> InsurancePolicyResponse:
    async with unit_of_work() as db:
        policy = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if policy is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")
        attachments = await insurance_policy_attachment_repo.list_by_policy(
            db, policy.id,
        )
    return _to_detail(policy, attachments)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_policy(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    policy_id: uuid.UUID,
    fields: dict[str, Any],
) -> InsurancePolicyResponse:
    async with unit_of_work() as db:
        policy = await insurance_policy_repo.update_policy(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
            fields=fields,
        )
        if policy is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")
        attachments = await insurance_policy_attachment_repo.list_by_policy(
            db, policy_id,
        )
        # Re-load policy so we return updated values.
        policy = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
    return _to_detail(policy, attachments)


# ---------------------------------------------------------------------------
# Soft-delete
# ---------------------------------------------------------------------------

async def soft_delete_policy(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    policy_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        policy = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if policy is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")
        await insurance_policy_repo.soft_delete(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

def _resolve_content_type(
    content: bytes, filename: str, declared: str | None,
) -> str | None:
    """Return a validated MIME type or None if not in the allowlist."""
    if declared and declared in ALLOWED_ATTACHMENT_MIME_TYPES:
        return declared
    lower = filename.lower()
    ext_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    for ext, ct in ext_map.items():
        if lower.endswith(ext):
            return ct
    return None


async def upload_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    policy_id: uuid.UUID,
    content: bytes,
    filename: str,
    declared_content_type: str | None,
    kind: str,
) -> InsurancePolicyAttachmentResponse:
    storage = get_storage()

    if kind not in INSURANCE_ATTACHMENT_KINDS:
        raise InvalidAttachmentKindError(f"Invalid kind: {kind}")

    if len(content) > _settings.max_blackout_attachment_size_bytes:
        max_mb = _settings.max_blackout_attachment_size_bytes // (1024 * 1024)
        raise AttachmentTooLargeError(f"File exceeds {max_mb}MB limit")

    ct = _resolve_content_type(content, filename, declared_content_type)
    if ct is None:
        raise AttachmentTypeRejectedError(
            "Unsupported file type. Allowed: pdf, docx, jpg, png, webp",
        )

    # Tenant scope — 404 if policy doesn't belong to this org/user.
    async with unit_of_work() as db:
        policy = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if policy is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")

    attachment_id = uuid.uuid4()
    storage_key = f"insurance-policies/{policy_id}/{attachment_id}"
    storage.upload_file(storage_key, content, ct)

    try:
        async with unit_of_work() as db:
            row = await insurance_policy_attachment_repo.create(
                db,
                policy_id=policy_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{attachment_id.hex}",
                content_type=ct,
                size_bytes=len(content),
                kind=kind,
                uploaded_by_user_id=user_id,
                uploaded_at=_dt.datetime.now(_dt.timezone.utc),
            )
            response = InsurancePolicyAttachmentResponse.model_validate(row)
    except Exception:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to clean up orphan insurance attachment %s", storage_key,
            )
        raise

    return attach_presigned_urls([response])[0]


async def delete_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    policy_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        # Tenant scope — 404 if policy doesn't belong to this org/user.
        policy = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if policy is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")
        deleted = await insurance_policy_attachment_repo.delete_by_id_scoped_to_policy(
            db, attachment_id, policy_id,
        )
        if deleted is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        storage_key = deleted.storage_key

    storage = get_storage()
    try:
        storage.delete_file(storage_key)
    except Exception:  # noqa: BLE001
        logger.warning(
            "Failed to delete insurance attachment object %s",
            storage_key, exc_info=True,
        )
