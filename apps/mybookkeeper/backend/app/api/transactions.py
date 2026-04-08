import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.common import BulkIdsRequest
from app.schemas.transactions.duplicate import DuplicateDismissRequest, DuplicateKeepRequest, DuplicateMergeRequest, DuplicatePair, DuplicatePairsResponse, DuplicateTransactionRead
from app.schemas.transactions.operation_responses import (
    BulkApproveResponse,
    BulkDeleteResponse,
    DismissDuplicatesResponse,
    KeepDuplicateResponse,
    MergeDuplicatesResponse,
)
from app.schemas.transactions.transaction import ScheduleELineItem, TransactionCreate, TransactionRead, TransactionUpdate, TransactionUpdateResponse
from app.services.transactions import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    property_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    vendor: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    tax_year: Optional[int] = None,
    limit: int = Query(default=1000, le=5000),
    offset: int = 0,
    ctx: RequestContext = Depends(current_org_member),
) -> list[TransactionRead]:
    return await transaction_service.list_transactions(
        ctx,
        property_id=property_id,
        status=status,
        transaction_type=transaction_type,
        category=category,
        vendor=vendor,
        start_date=start_date,
        end_date=end_date,
        tax_year=tax_year,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TransactionRead, status_code=201)
async def create_transaction(
    data: TransactionCreate,
    ctx: RequestContext = Depends(require_write_access),
) -> TransactionRead:
    try:
        return await transaction_service.create_manual_transaction(
            ctx, data.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/duplicates", response_model=DuplicatePairsResponse)
async def get_duplicates(
    limit: int = Query(default=100, le=500),
    ctx: RequestContext = Depends(current_org_member),
) -> DuplicatePairsResponse:
    pairs_raw = await transaction_service.get_duplicate_pairs(ctx, limit=limit)

    all_ids = [t.id for triple in pairs_raw for t in (triple[0], triple[1])]
    linked_docs = await transaction_service.get_linked_document_ids(ctx, all_ids)

    pairs = []
    for txn_a, txn_b, date_diff in pairs_raw:
        pair_id = f"{txn_a.id}_{txn_b.id}"
        prop_match = (
            txn_a.property_id == txn_b.property_id
            or txn_a.property_id is None
            or txn_b.property_id is None
        )
        confidence = "high" if date_diff <= 3 else "medium" if date_diff <= 10 else "low"

        a_data = DuplicateTransactionRead.model_validate(txn_a)
        a_data.linked_document_ids = linked_docs.get(txn_a.id, [])
        b_data = DuplicateTransactionRead.model_validate(txn_b)
        b_data.linked_document_ids = linked_docs.get(txn_b.id, [])

        pairs.append(DuplicatePair(
            id=pair_id,
            transaction_a=a_data,
            transaction_b=b_data,
            date_diff_days=date_diff,
            property_match=prop_match,
            confidence=confidence,
        ))
    return DuplicatePairsResponse(pairs=pairs, total=len(pairs))


@router.post("/duplicates/keep")
async def keep_duplicate(
    body: DuplicateKeepRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> KeepDuplicateResponse:
    try:
        result = await transaction_service.keep_transaction(ctx, body.keep_id, body.delete_ids)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return KeepDuplicateResponse(**result)


@router.post("/duplicates/dismiss")
async def dismiss_duplicates(
    body: DuplicateDismissRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> DismissDuplicatesResponse:
    result = await transaction_service.dismiss_duplicates(ctx, body.transaction_ids)
    return DismissDuplicatesResponse(**result)


@router.post("/duplicates/merge")
async def merge_duplicates(
    body: DuplicateMergeRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> MergeDuplicatesResponse:
    try:
        result = await transaction_service.merge_transactions(
            ctx,
            body.transaction_a_id,
            body.transaction_b_id,
            body.surviving_id,
            body.field_overrides,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail:
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)
    return MergeDuplicatesResponse(merged=True, surviving_id=str(result.id))


@router.get("/schedule-e", response_model=list[ScheduleELineItem])
async def schedule_e_report(
    tax_year: int = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> list[ScheduleELineItem]:
    rows = await transaction_service.get_schedule_e_report(ctx, tax_year)
    return [
        ScheduleELineItem(
            property_id=row.property_id,
            schedule_e_line=row.schedule_e_line,
            total_amount=float(row.total_amount),
        )
        for row in rows
    ]


@router.post("/bulk-approve")
async def bulk_approve(
    body: BulkIdsRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> BulkApproveResponse:
    result = await transaction_service.bulk_approve(ctx, body.ids)
    return BulkApproveResponse(**result)


@router.post("/bulk-delete")
async def bulk_delete(
    body: BulkIdsRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> BulkDeleteResponse:
    result = await transaction_service.bulk_delete(ctx, body.ids)
    return BulkDeleteResponse(**result)


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> TransactionRead:
    txn = await transaction_service.get_transaction(ctx, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.patch("/{transaction_id}", response_model=TransactionUpdateResponse)
async def update_transaction(
    transaction_id: uuid.UUID,
    updates: TransactionUpdate,
    ctx: RequestContext = Depends(require_write_access),
) -> TransactionUpdateResponse:
    try:
        result = await transaction_service.update_transaction(
            ctx, transaction_id, updates.model_dump(exclude_none=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn, retroactive_count = result
    return TransactionUpdateResponse(
        **TransactionRead.model_validate(txn).model_dump(),
        retroactive_count=retroactive_count,
    )


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    deleted = await transaction_service.delete_transaction(ctx, transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
