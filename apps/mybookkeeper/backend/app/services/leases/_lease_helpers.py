"""Internal helpers shared across the signed-lease service modules.

This module is package-private (``_`` prefix) — callers outside this package
must import from ``signed_lease_service`` or the focused service modules.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from platform_shared.core.storage import StorageNotConfiguredError  # noqa: F401

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.repositories.inquiries.inquiry_repo import get_by_applicant_inquiry_id
from app.repositories.leases import (
    lease_template_repo,
    lease_term_version_repo,
    signed_lease_attachment_repo,
    signed_lease_template_repo,
)
from app.repositories.listings import listing_repo
from app.repositories.properties import property_repo
from app.repositories.user import user_repo

from app.schemas.leases.lease_extension_summary import LeaseExtensionSummary
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.schemas.leases.signed_lease_summary import SignedLeaseSummary
from app.schemas.leases.signed_lease_template_link import SignedLeaseTemplateLink
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_attachments,
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SignedLeaseNotFoundError(LookupError):
    pass


class AttachmentNotFoundError(LookupError):
    pass


class MissingRequiredValuesError(ValueError):
    pass


class InvalidStatusTransitionError(ValueError):
    pass


class CannotEditValuesError(ValueError):
    """``values`` can only be edited while status=draft."""


class AttachmentTooLargeError(ValueError):
    pass


class AttachmentTypeRejectedError(ValueError):
    pass


class InvalidAttachmentKindError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Allowlist for signed-lease attachment uploads.
# ---------------------------------------------------------------------------

ALLOWED_ATTACHMENT_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
})

# Status transitions allowed by the host. Backwards transitions are disallowed
# so an "active" lease can't be flipped back to "draft" without a tech reset.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"draft", "generated"},
    "generated": {"generated", "sent", "signed"},
    "sent": {"sent", "signed"},
    "signed": {"signed", "active"},
    "active": {"active", "ended", "terminated"},
    "ended": {"ended"},
    "terminated": {"terminated"},
}


# ---------------------------------------------------------------------------
# Status validation
# ---------------------------------------------------------------------------

def _validate_status_transition(current: str, target: str) -> None:
    from app.core.lease_enums import SIGNED_LEASE_STATUSES
    if target == current:
        return
    if target not in SIGNED_LEASE_STATUSES:
        raise InvalidStatusTransitionError(f"Unknown status: {target}")
    if target not in _ALLOWED_TRANSITIONS.get(current, {current}):
        raise InvalidStatusTransitionError(
            f"Cannot move from '{current}' to '{target}'"
        )


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------

def _build_summary(
    lease,
    applicant_names: dict[uuid.UUID, str | None] | None = None,
    template_ids: list[uuid.UUID] | None = None,
) -> SignedLeaseSummary:
    summary = SignedLeaseSummary.model_validate(lease)
    updates: dict[str, Any] = {"template_ids": template_ids or []}
    if applicant_names is not None:
        updates["applicant_legal_name"] = applicant_names.get(lease.applicant_id)
    return summary.model_copy(update=updates)


def _attachment_responses(rows) -> list[SignedLeaseAttachmentResponse]:
    return attach_presigned_urls_to_attachments(
        [SignedLeaseAttachmentResponse.model_validate(r) for r in rows],
    )


def _to_detail(
    lease,
    attachments,
    template_links: list[SignedLeaseTemplateLink],
    latest_extension: "LeaseExtensionSummary | None" = None,
) -> SignedLeaseResponse:
    return SignedLeaseResponse(
        id=lease.id,
        user_id=lease.user_id,
        organization_id=lease.organization_id,
        templates=template_links,
        applicant_id=lease.applicant_id,
        listing_id=lease.listing_id,
        kind=lease.kind,
        values=dict(lease.values or {}),
        status=lease.status,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on,
        notes=lease.notes,
        generated_at=lease.generated_at,
        sent_at=lease.sent_at,
        signed_at=lease.signed_at,
        ended_at=lease.ended_at,
        auto_email_tenant=lease.auto_email_tenant,
        last_emailed_to_tenant_at=lease.last_emailed_to_tenant_at,
        created_at=lease.created_at,
        updated_at=lease.updated_at,
        attachments=_attachment_responses(attachments),
        latest_extension=latest_extension,
    )


async def _resolve_latest_extension(
    db,
    *,
    lease_id: uuid.UUID,
) -> "LeaseExtensionSummary | None":
    """Load the newest live extension (seed excluded) for inclusion in detail responses."""
    row = await lease_term_version_repo.get_latest_extension(db, lease_id=lease_id)
    if row is None:
        return None
    return LeaseExtensionSummary.model_validate(row)


async def _resolve_template_links(
    db,
    *,
    lease_id: uuid.UUID,
) -> list[SignedLeaseTemplateLink]:
    """Resolve the ordered list of template links (id + name + version) for a lease."""
    join_rows = await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    if not join_rows:
        return []
    template_ids = [r.template_id for r in join_rows]
    templates = await lease_template_repo.list_by_ids(
        db, template_ids=template_ids,
    )
    templates_by_id = {t.id: t for t in templates}
    links: list[SignedLeaseTemplateLink] = []
    for r in join_rows:
        template = templates_by_id.get(r.template_id)
        if template is None:
            continue
        links.append(
            SignedLeaseTemplateLink(
                id=template.id,
                name=template.name,
                version=template.version,
                display_order=r.display_order,
            )
        )
    return links


def _denormalise_dates(values: dict[str, Any]) -> tuple[_dt.date | None, _dt.date | None]:
    """Pull ``starts_on`` and ``ends_on`` from a values dict if present."""
    def _coerce(v: Any) -> _dt.date | None:
        if v is None:
            return None
        if isinstance(v, _dt.date) and not isinstance(v, _dt.datetime):
            return v
        if isinstance(v, str):
            try:
                return _dt.date.fromisoformat(v)
            except ValueError:
                return None
        return None

    candidates_start = ("MOVE-IN DATE", "MOVE_IN_DATE", "MOVE IN DATE")
    candidates_end = ("MOVE-OUT DATE", "MOVE_OUT_DATE", "MOVE OUT DATE")
    starts = next((_coerce(values[k]) for k in candidates_start if k in values), None)
    ends = next((_coerce(values[k]) for k in candidates_end if k in values), None)
    return starts, ends


async def _load_resolution_context(
    db,
    *,
    lease,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[Applicant | None, Inquiry | None, Property | None, User | None]:
    """Load applicant + inquiry + property + host user for placeholder resolution.

    Used by ``add_templates_and_generate`` and ``prefill_addendum_placeholders``
    to populate ``default_source`` resolution against live ORM rows. All four
    return values may be ``None`` — the resolver is expected to tolerate
    missing context (e.g. an imported lease with no listing has no property).
    """
    applicant = await applicant_repo.get(
        db,
        applicant_id=lease.applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    inquiry = None
    if applicant is not None and applicant.inquiry_id is not None:
        inquiry = await get_by_applicant_inquiry_id(
            db,
            inquiry_id=applicant.inquiry_id,
            organization_id=organization_id,
            user_id=user_id,
        )
    property_record = None
    if lease.listing_id is not None:
        listing = await listing_repo.get_by_id(
            db, lease.listing_id, organization_id,
        )
        if listing is not None and listing.property_id is not None:
            property_record = await property_repo.get_by_id(
                db, listing.property_id, organization_id,
            )
    user_record = await user_repo.get_by_id(db, user_id)
    return applicant, inquiry, property_record, user_record
