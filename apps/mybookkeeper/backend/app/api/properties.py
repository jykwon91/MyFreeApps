import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.models.requests.property_create import PropertyCreate
from app.models.requests.property_update import PropertyUpdate
from app.schemas.properties.property import PropertyRead
from app.schemas.properties.property_value_response import PropertyValueResponse
from app.schemas.properties.property_value_update_request import PropertyValueUpdateRequest
from app.services.properties import property_service, property_value_service
from app.services.properties.property_not_found_error import PropertyNotFoundError

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=list[PropertyRead])
async def list_properties(
    ctx: RequestContext = Depends(current_org_member),
) -> list[PropertyRead]:
    return await property_service.list_properties(ctx)


@router.post("", response_model=PropertyRead)
async def create_property(
    data: PropertyCreate,
    ctx: RequestContext = Depends(require_write_access),
):
    try:
        return await property_service.create_property(
            ctx, data.name, data.address, data.classification, data.type,
            data.purchase_price,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/{property_id}", response_model=PropertyRead)
async def update_property(
    property_id: uuid.UUID,
    updates: PropertyUpdate,
    ctx: RequestContext = Depends(require_write_access),
):
    try:
        result = await property_service.update_property(
            ctx, property_id, updates.model_dump(exclude_none=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Property not found")
    return result


@router.put("/{property_id}/estimated-value", response_model=PropertyValueResponse)
async def set_property_estimated_value(
    property_id: uuid.UUID,
    payload: PropertyValueUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> PropertyValueResponse:
    """What the home is worth today, for net worth. Null clears it."""
    try:
        return await property_value_service.set_estimated_value(
            property_id=property_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            value_cents=payload.estimated_value_cents,
            today=_dt.date.today(),
        )
    except PropertyNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Property not found") from exc


@router.delete("/{property_id}", status_code=204)
async def delete_property(
    property_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    deleted = await property_service.delete_property(ctx, property_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Property not found")
