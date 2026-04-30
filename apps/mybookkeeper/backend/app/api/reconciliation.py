from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.transactions.reconciliation import (
    AutoReconcileResponse,
    CreateMatchRequest,
    ReconciliationMatchRead,
    ReconciliationSourceRead,
    Upload1099Request,
)
from app.services.transactions import reconciliation_route_service

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


@router.post("/upload-1099", response_model=ReconciliationSourceRead, status_code=201)
async def upload_1099(
    body: Upload1099Request,
    ctx: RequestContext = Depends(require_write_access),
):
    try:
        return await reconciliation_route_service.upload_1099(
            ctx, body.source_type, body.tax_year, body.issuer, body.reported_amount,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/sources", response_model=list[ReconciliationSourceRead])
async def list_sources(
    tax_year: int = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> list[ReconciliationSourceRead]:
    return list(await reconciliation_route_service.list_sources(ctx, tax_year))


@router.get("/discrepancies", response_model=list[ReconciliationSourceRead])
async def list_discrepancies(
    tax_year: int = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> list[ReconciliationSourceRead]:
    return list(await reconciliation_route_service.get_discrepancies(ctx, tax_year))


@router.post("/auto-reconcile")
async def auto_reconcile(
    tax_year: int = Query(...),
    ctx: RequestContext = Depends(require_write_access),
) -> AutoReconcileResponse:
    result = await reconciliation_route_service.auto_reconcile(ctx, tax_year)
    return AutoReconcileResponse(**result)


@router.post("/match", response_model=ReconciliationMatchRead, status_code=201)
async def create_match(
    body: CreateMatchRequest,
    ctx: RequestContext = Depends(require_write_access),
):
    try:
        return await reconciliation_route_service.create_match(
            ctx, body.reconciliation_source_id, body.booking_statement_id, body.matched_amount,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
