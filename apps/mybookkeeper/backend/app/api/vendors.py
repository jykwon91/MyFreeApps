"""HTTP routes for the Vendors domain.

PR 4.1a ships read-only list / detail. Write endpoints (POST / PATCH /
DELETE) and the ``Transaction.vendor_id`` FK land in PR 4.2 alongside the
combined-FK migration.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.vendors.vendor_list_response import VendorListResponse
from app.schemas.vendors.vendor_response import VendorResponse
from app.services.vendors import vendor_service

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    category: str | None = Query(None, description="Optional category filter"),
    preferred: bool | None = Query(
        None, description="If set, filter to preferred=true / preferred=false",
    ),
    include_deleted: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> VendorListResponse:
    return await vendor_service.list_vendors(
        ctx.organization_id,
        ctx.user_id,
        category=category,
        preferred=preferred,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )


@router.get("/{vendor_id}", response_model=VendorResponse)
async def get_vendor(
    vendor_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> VendorResponse:
    try:
        return await vendor_service.get_vendor(
            ctx.organization_id, ctx.user_id, vendor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Vendor not found") from exc
