"""HTTP routes for the Vendors domain.

PR 4.1a shipped read-only list / detail. PR 4.2 ships POST / PATCH / DELETE
plus the ``Transaction.vendor_id`` FK in migration ``h0j2k5m7n9p1``.

Auth: read endpoints use ``current_org_member`` (any role can read).
Write endpoints use ``require_write_access`` so VIEWER members are blocked
with HTTP 403 — matches the listings + applicants conventions.

Audit: vendor INSERT / UPDATE / DELETE rows are captured automatically by
the SQLAlchemy session-level listener in ``app.core.audit``. The DELETE
flow additionally clears every linked ``transactions.vendor_id`` via an
explicit UPDATE in the service layer so those rows are captured too — the
DB-level ``ON DELETE SET NULL`` action alone would bypass the listener.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.vendors.vendor_create_request import VendorCreateRequest
from app.schemas.vendors.vendor_list_response import VendorListResponse
from app.schemas.vendors.vendor_response import VendorResponse
from app.schemas.vendors.vendor_update_request import VendorUpdateRequest
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


@router.post("", response_model=VendorResponse, status_code=201)
async def create_vendor(
    payload: VendorCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> VendorResponse:
    return await vendor_service.create_vendor(
        ctx.organization_id, ctx.user_id, payload,
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


@router.patch("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: uuid.UUID,
    payload: VendorUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> VendorResponse:
    try:
        return await vendor_service.update_vendor(
            ctx.organization_id, ctx.user_id, vendor_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Vendor not found") from exc


@router.delete("/{vendor_id}", status_code=204)
async def delete_vendor(
    vendor_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    """Hard-delete a vendor.

    Every linked ``Transaction.vendor_id`` is cleared (the FK is
    ``ON DELETE SET NULL`` and the service layer also issues an explicit
    UPDATE so the audit listener captures the change). Transaction history
    is preserved — only the rolodex link is detached.
    """
    try:
        await vendor_service.delete_vendor(
            ctx.organization_id, ctx.user_id, vendor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Vendor not found") from exc
    return Response(status_code=204)
