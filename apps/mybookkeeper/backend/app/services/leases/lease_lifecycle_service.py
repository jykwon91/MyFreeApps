"""Signed lease lifecycle service: create, list, get, update, soft-delete.

These operations do not touch PDF rendering or MinIO — they are pure
database interactions on the ``signed_leases`` and related tables.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.leases import (
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.signed_lease_list_response import SignedLeaseListResponse
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    CannotEditValuesError,
    InvalidStatusTransitionError,
    MissingRequiredValuesError,
    SignedLeaseNotFoundError,
    _attachment_responses,
    _build_summary,
    _denormalise_dates,
    _resolve_template_links,
    _to_detail,
    _validate_status_transition,
)
from app.services.leases.lease_template_service import TemplateNotFoundError


# ---------------------------------------------------------------------------
# Create a draft lease
# ---------------------------------------------------------------------------

async def create_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_ids: list[uuid.UUID],
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    values: dict[str, Any],
) -> SignedLeaseResponse:
    """Create a draft signed lease from one or more templates.

    Validates required placeholders across the union of all selected
    templates. Persists ONE ``signed_leases`` row plus N rows in
    ``signed_lease_templates`` (one per template, ordered by
    ``display_order`` matching the host's pick order).
    """
    if not template_ids:
        raise TemplateNotFoundError("At least one template_id is required")

    async with unit_of_work() as db:
        seen_keys: set[str] = set()
        merged_required: list = []
        for tid in template_ids:
            template = await lease_template_repo.get(
                db,
                template_id=tid,
                user_id=user_id,
                organization_id=organization_id,
            )
            if template is None:
                raise TemplateNotFoundError(f"Template {tid} not found")
            placeholders = await lease_template_placeholder_repo.list_for_template(
                db, template_id=tid,
            )
            for p in placeholders:
                if p.key in seen_keys:
                    continue
                seen_keys.add(p.key)
                merged_required.append(p)

        missing: list[str] = []
        for p in merged_required:
            if not p.required:
                continue
            if p.input_type == "computed":
                continue
            if p.input_type == "signature":
                continue
            if values.get(p.key) in (None, ""):
                missing.append(p.key)
        if missing:
            raise MissingRequiredValuesError(
                f"Missing required values: {', '.join(missing)}"
            )

        starts, ends = _denormalise_dates(values)

        lease = await signed_lease_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            values=values,
            starts_on=starts,
            ends_on=ends,
            status="draft",
            kind="generated",
        )
        for order, tid in enumerate(template_ids):
            await signed_lease_template_repo.create(
                db,
                lease_id=lease.id,
                template_id=tid,
                display_order=order,
            )

        attachments = await signed_lease_attachment_repo.list_by_lease(db, lease.id)
        template_links = await _resolve_template_links(db, lease_id=lease.id)
    return _to_detail(lease, attachments, template_links)


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

async def list_leases(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
    listing_id: uuid.UUID | None = None,
    status: str | None = None,
    starts_after: _dt.date | None = None,
    starts_before: _dt.date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> SignedLeaseListResponse:
    async with unit_of_work() as db:
        rows = await signed_lease_repo.list_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            status=status,
            starts_after=starts_after,
            starts_before=starts_before,
            limit=limit,
            offset=offset,
        )
        total = await signed_lease_repo.count_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            status=status,
        )

        applicant_ids = [aid for aid in {r.applicant_id for r in rows} if aid is not None]
        applicants = await applicant_repo.list_by_ids(
            db,
            organization_id=organization_id,
            user_id=user_id,
            applicant_ids=applicant_ids,
        )
        applicant_names: dict[uuid.UUID, str | None] = {
            a.id: a.legal_name for a in applicants
        }

        template_ids_by_lease = await signed_lease_template_repo.list_template_ids_for_leases(
            db, lease_ids=[r.id for r in rows],
        )

    items = [
        _build_summary(r, applicant_names, template_ids_by_lease.get(r.id, []))
        for r in rows
    ]
    return SignedLeaseListResponse(
        items=items, total=total, has_more=(offset + len(items)) < total,
    )


async def get_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> SignedLeaseResponse:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        attachments = await signed_lease_attachment_repo.list_by_lease(
            db, lease.id,
        )
        template_links = await _resolve_template_links(db, lease_id=lease.id)
    return _to_detail(lease, attachments, template_links)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    notes: str | None,
    status: str | None,
    values: dict[str, Any] | None,
    auto_email_tenant: bool | None = None,
) -> SignedLeaseResponse:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        fields: dict[str, Any] = {}
        if notes is not None:
            fields["notes"] = notes

        if status is not None:
            _validate_status_transition(lease.status, status)
            fields["status"] = status
            now = _dt.datetime.now(_dt.timezone.utc)
            if status == "sent" and lease.sent_at is None:
                fields["sent_at"] = now
            if status == "signed" and lease.signed_at is None:
                fields["signed_at"] = now
            if status in ("ended", "terminated") and lease.ended_at is None:
                fields["ended_at"] = now

        if auto_email_tenant is not None:
            fields["auto_email_tenant"] = auto_email_tenant

        if values is not None:
            if lease.status != "draft":
                raise CannotEditValuesError(
                    "Values can only be edited while the lease is a draft",
                )
            fields["values"] = values
            starts, ends = _denormalise_dates(values)
            fields["starts_on"] = starts
            fields["ends_on"] = ends

        if fields:
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields=fields,
            )

        attachments = await signed_lease_attachment_repo.list_by_lease(
            db, lease_id,
        )
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        template_links = await _resolve_template_links(db, lease_id=lease_id)
    return _to_detail(lease, attachments, template_links)


# ---------------------------------------------------------------------------
# Soft-delete
# ---------------------------------------------------------------------------

async def soft_delete_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        await signed_lease_repo.soft_delete(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
