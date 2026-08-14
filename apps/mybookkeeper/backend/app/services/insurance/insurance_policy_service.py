"""Service layer for insurance policies.

Handles CRUD + attachment upload/delete for the insurance domain.

All data access is through repositories; never imports SQLAlchemy in this
module.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from decimal import Decimal
from typing import Any

from app.core.config import settings as _settings
from app.core.insurance_enums import INSURANCE_ATTACHMENT_KINDS
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.insurance import (
    insurance_policy_attachment_repo,
    insurance_policy_repo,
)
from app.schemas.insurance.insurance_policy_validation import validate_policy_fields
from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.schemas.insurance.insurance_policy_list_response import (
    InsurancePolicyListResponse,
)
from app.schemas.insurance.insurance_policy_response import InsurancePolicyResponse
from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
from app.repositories.properties import property_repo
from app.services.documents.document_ownership import owns_document
from app.services.insurance._merged_policy import MergedPolicy
from app.services.insurance.attachment_response_builder import attach_presigned_urls
from app.services.properties.property_ownership import owns_property

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class InsurancePolicyNotFoundError(LookupError):
    pass


class InvalidInsurancePolicyError(ValueError):
    """A payload that would leave the stored row internally inconsistent."""


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


async def _assert_source_document_is_ours(
    db, *, organization_id: uuid.UUID, document_id: uuid.UUID | None,
) -> None:
    """Reject a ``source_document_id`` belonging to another organization.

    The foreign key only proves the document exists — it is global. The client
    supplies this id directly, so it is checked here rather than trusted.
    """
    if document_id is None:
        return
    if not await owns_document(
        db, organization_id=organization_id, document_id=document_id,
    ):
        raise InvalidInsurancePolicyError(
            "source_document_id does not name a document",
        )


async def _assert_property_is_ours(
    db, *, organization_id: uuid.UUID, property_id: uuid.UUID,
) -> None:
    """Reject a ``property_id`` belonging to another organization.

    The foreign key only proves the property row exists. The client supplies
    this id directly, so ownership is checked here rather than trusted.
    """
    if not await owns_property(
        db, organization_id=organization_id, property_id=property_id,
    ):
        raise InvalidInsurancePolicyError("property_id does not name a property")


def _to_detail(
    policy, attachments: list, property_name: str | None = None,
) -> InsurancePolicyResponse:
    return InsurancePolicyResponse(
        id=policy.id,
        user_id=policy.user_id,
        organization_id=policy.organization_id,
        property_id=policy.property_id,
        property_name=property_name,
        source_document_id=policy.source_document_id,
        policy_name=policy.policy_name,
        carrier=policy.carrier,
        policy_number=policy.policy_number,
        effective_date=policy.effective_date,
        expiration_date=policy.expiration_date,
        coverage_amount_cents=policy.coverage_amount_cents,
        premium_cents=policy.premium_cents,
        premium_frequency=policy.premium_frequency,
        deductible_cents=policy.deductible_cents,
        wind_hail_deductible_pct=policy.wind_hail_deductible_pct,
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
    property_id: uuid.UUID,
    policy_name: str,
    source_document_id: uuid.UUID | None,
    carrier: str | None,
    policy_number: str | None,
    effective_date: _dt.date | None,
    expiration_date: _dt.date | None,
    coverage_amount_cents: int | None,
    premium_cents: int | None,
    premium_frequency: str | None,
    deductible_cents: int | None,
    wind_hail_deductible_pct: Decimal | None,
    notes: str | None,
) -> InsurancePolicyResponse:
    async with unit_of_work() as db:
        await _assert_property_is_ours(
            db, organization_id=organization_id, property_id=property_id,
        )
        await _assert_source_document_is_ours(
            db, organization_id=organization_id, document_id=source_document_id,
        )
        policy = await insurance_policy_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            source_document_id=source_document_id,
            policy_name=policy_name,
            carrier=carrier,
            policy_number=policy_number,
            effective_date=effective_date,
            expiration_date=expiration_date,
            coverage_amount_cents=coverage_amount_cents,
            premium_cents=premium_cents,
            premium_frequency=premium_frequency,
            deductible_cents=deductible_cents,
            wind_hail_deductible_pct=wind_hail_deductible_pct,
            notes=notes,
        )
        names = await property_repo.get_name_map(db, organization_id)
        detail = _to_detail(policy, [], names.get(policy.property_id))
    return detail


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

async def list_policies(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    expiring_before: _dt.date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> InsurancePolicyListResponse:
    async with unit_of_work() as db:
        rows = await insurance_policy_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            expiring_before=expiring_before,
            limit=limit,
            offset=offset,
        )
        total = await insurance_policy_repo.count_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            expiring_before=expiring_before,
        )
        names = await property_repo.get_name_map(db, organization_id)
    items = [
        InsurancePolicySummary.model_validate(r).model_copy(
            update={"property_name": names.get(r.property_id)},
        )
        for r in rows
    ]
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
        names = await property_repo.get_name_map(db, organization_id)
    return _to_detail(policy, attachments, names.get(policy.property_id))


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
        existing = await insurance_policy_repo.get(
            db,
            policy_id=policy_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if existing is None:
            raise InsurancePolicyNotFoundError(f"Policy {policy_id} not found")

        # Re-checked against the merged row, not the payload: clearing one half
        # of the premium pair while the other stays stored is a violation the
        # partial payload alone cannot see.
        try:
            validate_policy_fields(MergedPolicy(existing, fields))
        except ValueError as exc:
            raise InvalidInsurancePolicyError(str(exc)) from exc

        await _assert_source_document_is_ours(
            db,
            organization_id=organization_id,
            document_id=fields.get("source_document_id"),
        )

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
        names = await property_repo.get_name_map(db, organization_id)
    return _to_detail(policy, attachments, names.get(policy.property_id))


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
