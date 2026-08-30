"""HTTP routes for the tenant rent ledger.

Route prefix: /rent-ledger.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.rent.rent_charge_create_request import RentChargeCreateRequest
from app.schemas.rent.rent_charge_waive_request import RentChargeWaiveRequest
from app.schemas.rent.rent_ledger_response import RentLedgerResponse
from app.schemas.rent.rent_schedule_create_request import RentScheduleCreateRequest
from app.schemas.rent.rent_schedule_response import RentScheduleResponse
from app.schemas.rent.rent_schedule_update_request import RentScheduleUpdateRequest
from app.services.rent import rent_ledger_service, rent_schedule_service

router = APIRouter(prefix="/rent-ledger", tags=["rent-ledger"])

_TENANT_NOT_FOUND = "Tenant not found"
_SCHEDULE_NOT_FOUND = "Rent schedule not found"
_CHARGE_NOT_FOUND = "Charge not found"


@router.get("/tenants/{applicant_id}", response_model=RentLedgerResponse)
async def get_ledger(
    applicant_id: uuid.UUID,
    as_of: _dt.date | None = Query(
        default=None,
        description=(
            "Evaluate the ledger as of this date instead of today. Charges are "
            "generated up to it, so a past date shows the ledger as it stood."
        ),
    ),
    ctx: RequestContext = Depends(current_org_member),
) -> RentLedgerResponse:
    try:
        return await rent_ledger_service.get_ledger(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            as_of=as_of,
        )
    except rent_ledger_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc


@router.post("/schedules", response_model=RentScheduleResponse, status_code=201)
async def create_schedule(
    payload: RentScheduleCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> RentScheduleResponse:
    try:
        return await rent_schedule_service.create_schedule(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=payload.applicant_id,
            amount=payload.amount,
            cadence=payload.cadence,
            start_date=payload.start_date,
            property_id=payload.property_id,
            end_date=payload.end_date,
            grace_days=payload.grace_days,
            notes=payload.notes,
        )
    except rent_schedule_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_schedule_service.OverlappingScheduleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/schedules/{schedule_id}", response_model=RentScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    payload: RentScheduleUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> RentScheduleResponse:
    try:
        return await rent_schedule_service.update_schedule(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            schedule_id=schedule_id,
            end_date=payload.end_date,
            grace_days=payload.grace_days,
            notes=payload.notes,
            # ``model_fields_set`` is what separates "omitted" from "explicitly
            # null" — without it, clearing an end date and not touching it look
            # identical on the wire.
            fields_set=payload.model_fields_set,
        )
    except rent_schedule_service.ScheduleNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_SCHEDULE_NOT_FOUND) from exc
    except rent_schedule_service.OverlappingScheduleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    try:
        await rent_schedule_service.delete_schedule(
            organization_id=ctx.organization_id, schedule_id=schedule_id,
        )
    except rent_schedule_service.ScheduleNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_SCHEDULE_NOT_FOUND) from exc


@router.post("/charges", status_code=201)
async def add_charge(
    payload: RentChargeCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> dict[str, uuid.UUID]:
    try:
        charge_id = await rent_schedule_service.add_charge(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=payload.applicant_id,
            amount=payload.amount,
            due_date=payload.due_date,
            charge_type=payload.charge_type,
            period_start=payload.period_start,
            period_end=payload.period_end,
            description=payload.description,
        )
    except rent_schedule_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"id": charge_id}


@router.post("/charges/{charge_id}/waive", status_code=204)
async def waive_charge(
    charge_id: uuid.UUID,
    payload: RentChargeWaiveRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    try:
        await rent_schedule_service.waive_charge(
            organization_id=ctx.organization_id,
            charge_id=charge_id,
            reason=payload.reason,
        )
    except rent_schedule_service.ChargeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_CHARGE_NOT_FOUND) from exc


@router.delete("/charges/{charge_id}/waive", status_code=204)
async def unwaive_charge(
    charge_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    try:
        await rent_schedule_service.unwaive_charge(
            organization_id=ctx.organization_id, charge_id=charge_id,
        )
    except rent_schedule_service.ChargeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_CHARGE_NOT_FOUND) from exc


@router.delete("/charges/{charge_id}", status_code=204)
async def delete_charge(
    charge_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    """Soft-delete a one-off charge.

    A schedule-generated charge deleted this way is regenerated on the next
    ledger read; waive it instead to make it stop counting.
    """
    try:
        await rent_schedule_service.delete_charge(
            organization_id=ctx.organization_id, charge_id=charge_id,
        )
    except rent_schedule_service.ChargeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_CHARGE_NOT_FOUND) from exc
