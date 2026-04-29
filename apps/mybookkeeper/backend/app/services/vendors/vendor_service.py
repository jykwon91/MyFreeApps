"""Vendors service — read-only orchestration for PR 4.1a.

Per the layered-architecture rule: services orchestrate (load → decide →
shape), repositories own queries. Tenant isolation is via
``(organization_id, user_id)`` per RENTALS_PLAN.md §8.1.

Write operations (create / update / delete + Transaction.vendor_id link)
land in PR 4.2 with the combined-FK migration.
"""
from __future__ import annotations

import uuid

from app.db.session import AsyncSessionLocal
from app.repositories.vendors import vendor_repo
from app.schemas.vendors.vendor_list_response import VendorListResponse
from app.schemas.vendors.vendor_response import VendorResponse
from app.schemas.vendors.vendor_summary import VendorSummary


def _to_summary(vendor) -> VendorSummary:
    return VendorSummary.model_validate(vendor)


def _to_response(vendor) -> VendorResponse:
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
