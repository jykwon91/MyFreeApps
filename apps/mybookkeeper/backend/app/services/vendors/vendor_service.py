"""Vendors service — orchestration for PRs 4.1a (read) + 4.2 (writes).

Per the layered-architecture rule: services orchestrate (load → decide →
shape), repositories own queries. Tenant isolation is via
``(organization_id, user_id)`` per RENTALS_PLAN.md §8.1.

Phase 4 / PR 4.2 adds ``create_vendor`` / ``update_vendor`` / ``delete_vendor``
plus the ``Transaction.vendor_id`` FK link. ``delete_vendor`` is a hard
delete: every linked transaction has its ``vendor_id`` set to NULL via an
explicit UPDATE (so the audit log captures it) before the vendor row is
removed.
"""
from __future__ import annotations

import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.vendors.vendor import Vendor
from app.repositories.vendors import vendor_repo
from app.schemas.vendors.vendor_create_request import VendorCreateRequest
from app.schemas.vendors.vendor_list_response import VendorListResponse
from app.schemas.vendors.vendor_response import VendorResponse
from app.schemas.vendors.vendor_summary import VendorSummary
from app.schemas.vendors.vendor_update_request import VendorUpdateRequest


def _to_summary(vendor: Vendor) -> VendorSummary:
    return VendorSummary.model_validate(vendor)


def _to_response(vendor: Vendor) -> VendorResponse:
    return VendorResponse.model_validate(vendor)


async def list_vendors(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    category: str | None = None,
    preferred: bool | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> VendorListResponse:
    """List vendors for a tenant. Newest first. Paginated."""
    async with AsyncSessionLocal() as db:
        rows = await vendor_repo.list_by_organization(
            db,
            organization_id=organization_id,
            user_id=user_id,
            category=category,
            preferred=preferred,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
        total = await vendor_repo.count_by_organization(
            db,
            organization_id=organization_id,
            user_id=user_id,
            category=category,
            preferred=preferred,
            include_deleted=include_deleted,
        )
    items = [_to_summary(row) for row in rows]
    has_more = (offset + len(items)) < total
    return VendorListResponse(items=items, total=total, has_more=has_more)


async def get_vendor(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
) -> VendorResponse:
    """Return the vendor's full payload. Raises ``LookupError`` if not found."""
    async with AsyncSessionLocal() as db:
        vendor = await vendor_repo.get_by_id(
            db,
            vendor_id=vendor_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if vendor is None:
            raise LookupError(f"Vendor {vendor_id} not found")
    return _to_response(vendor)


async def create_vendor(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: VendorCreateRequest,
) -> VendorResponse:
    """Persist a new Vendor scoped to ``(organization_id, user_id)``.

    Vendors carry no PII so the request shape is plaintext throughout. The
    DB ``CheckConstraint`` on ``category`` is the authoritative validation;
    Pydantic re-validates against the same tuple for an early 422 response.
    """
    async with unit_of_work() as db:
        vendor = await vendor_repo.create(
            db,
            organization_id=organization_id,
            user_id=user_id,
            name=payload.name,
            category=payload.category,
            phone=payload.phone,
            email=payload.email,
            address=payload.address,
            hourly_rate=payload.hourly_rate,
            flat_rate_notes=payload.flat_rate_notes,
            preferred=payload.preferred,
            notes=payload.notes,
        )
        return _to_response(vendor)


async def update_vendor(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
    payload: VendorUpdateRequest,
) -> VendorResponse:
    """Apply allowlisted PATCH updates to a vendor.

    Raises ``LookupError`` if the vendor does not exist, is soft-deleted,
    or belongs to a different ``(organization_id, user_id)`` scope.
    """
    fields = payload.to_update_dict()
    async with unit_of_work() as db:
        vendor = await vendor_repo.update(
            db,
            vendor_id=vendor_id,
            organization_id=organization_id,
            user_id=user_id,
            fields=fields,
        )
        if vendor is None:
            raise LookupError(f"Vendor {vendor_id} not found")
        return _to_response(vendor)


async def delete_vendor(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
) -> int:
    """Hard-delete a vendor and clear the FK on every linked transaction.

    Returns the number of transactions whose ``vendor_id`` was cleared (for
    audit / response metadata). The clear runs as an explicit UPDATE before
    the DELETE so the audit listener captures every cleared row — relying
    solely on the FK's DB-level ``ON DELETE SET NULL`` would silently bypass
    the audit log.

    Raises ``LookupError`` if the vendor does not exist or belongs to a
    different ``(organization_id, user_id)`` scope.
    """
    async with unit_of_work() as db:
        vendor = await vendor_repo.get_by_id(
            db,
            vendor_id=vendor_id,
            organization_id=organization_id,
            user_id=user_id,
            include_deleted=True,
        )
        if vendor is None:
            raise LookupError(f"Vendor {vendor_id} not found")

        nulled = await vendor_repo.null_vendor_on_transactions(
            db,
            vendor_id=vendor_id,
            organization_id=organization_id,
        )
        await vendor_repo.hard_delete_by_id(
            db,
            vendor_id=vendor_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        return nulled
