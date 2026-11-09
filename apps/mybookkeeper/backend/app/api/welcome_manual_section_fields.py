"""Welcome-manual section field routes: the label and value pairs of one section.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.schemas.welcome_manuals.welcome_manual_section_field_create_request import (
    WelcomeManualSectionFieldCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_section_field_reorder_request import (
    WelcomeManualSectionFieldReorderRequest,
)
from app.schemas.welcome_manuals.welcome_manual_section_field_response import (
    WelcomeManualSectionFieldResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_field_update_request import (
    WelcomeManualSectionFieldUpdateRequest,
)
from app.services.welcome_manuals import welcome_manual_section_field_service

router = APIRouter(prefix="/welcome-manuals", tags=["welcome-manuals"])


@router.post(
    "/{manual_id}/sections/{section_id}/fields",
    response_model=WelcomeManualSectionFieldResponse,
    status_code=201,
)
async def add_section_field(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: WelcomeManualSectionFieldCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualSectionFieldResponse:
    try:
        return await welcome_manual_section_field_service.add_field(
            ctx.organization_id, ctx.user_id, manual_id, section_id,
            payload.label, payload.value,
        )
    except welcome_manual_section_field_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_field_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_field_service.TooManyFieldsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.put(
    "/{manual_id}/sections/{section_id}/fields/order",
    response_model=list[WelcomeManualSectionFieldResponse],
)
async def reorder_section_fields(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: WelcomeManualSectionFieldReorderRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> list[WelcomeManualSectionFieldResponse]:
    try:
        return await welcome_manual_section_field_service.reorder_fields(
            ctx.organization_id, ctx.user_id, manual_id, section_id, payload.field_ids,
        )
    except welcome_manual_section_field_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_field_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_field_service.InvalidFieldReorderError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch(
    "/{manual_id}/sections/{section_id}/fields/{field_id}",
    response_model=WelcomeManualSectionFieldResponse,
)
async def update_section_field(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
    payload: WelcomeManualSectionFieldUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualSectionFieldResponse:
    try:
        return await welcome_manual_section_field_service.update_field(
            ctx.organization_id, ctx.user_id, manual_id, section_id, field_id,
            payload.to_update_dict(),
        )
    except welcome_manual_section_field_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_field_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_field_service.FieldNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Field not found") from exc


@router.delete(
    "/{manual_id}/sections/{section_id}/fields/{field_id}",
    status_code=204,
)
async def delete_section_field(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await welcome_manual_section_field_service.delete_field(
            ctx.organization_id, ctx.user_id, manual_id, section_id, field_id,
        )
    except welcome_manual_section_field_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_field_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_field_service.FieldNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Field not found") from exc
    return Response(status_code=204)
