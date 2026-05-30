import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_image_update_request import (
    WelcomeManualSectionImageUpdateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_create_request import (
    WelcomeManualCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_list_response import (
    WelcomeManualListResponse,
)
from app.schemas.welcome_manuals.welcome_manual_response import WelcomeManualResponse
from app.schemas.welcome_manuals.welcome_manual_section_create_request import (
    WelcomeManualSectionCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_section_reorder_request import (
    WelcomeManualSectionReorderRequest,
)
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_update_request import (
    WelcomeManualSectionUpdateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_update_request import (
    WelcomeManualUpdateRequest,
)
from app.services.welcome_manuals import (
    welcome_manual_section_image_service,
    welcome_manual_section_service,
    welcome_manual_service,
)

router = APIRouter(prefix="/welcome-manuals", tags=["welcome-manuals"])


# ---------------------------------------------------------------------------
# Manuals
# ---------------------------------------------------------------------------


@router.get("", response_model=WelcomeManualListResponse)
async def list_welcome_manuals(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> WelcomeManualListResponse:
    return await welcome_manual_service.list_manuals(
        ctx.organization_id, ctx.user_id, limit=limit, offset=offset,
    )


@router.post("", response_model=WelcomeManualResponse, status_code=201)
async def create_welcome_manual(
    payload: WelcomeManualCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualResponse:
    try:
        return await welcome_manual_service.create_manual(
            ctx.organization_id, ctx.user_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{manual_id}", response_model=WelcomeManualResponse)
async def get_welcome_manual(
    manual_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> WelcomeManualResponse:
    try:
        return await welcome_manual_service.get_manual(
            ctx.organization_id, ctx.user_id, manual_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc


@router.put("/{manual_id}", response_model=WelcomeManualResponse)
async def update_welcome_manual(
    manual_id: uuid.UUID,
    payload: WelcomeManualUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualResponse:
    try:
        return await welcome_manual_service.update_manual(
            ctx.organization_id, ctx.user_id, manual_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{manual_id}", status_code=204)
async def delete_welcome_manual(
    manual_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await welcome_manual_service.soft_delete_manual(
            ctx.organization_id, ctx.user_id, manual_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


@router.post(
    "/{manual_id}/sections",
    response_model=WelcomeManualSectionResponse,
    status_code=201,
)
async def add_section(
    manual_id: uuid.UUID,
    payload: WelcomeManualSectionCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualSectionResponse:
    try:
        return await welcome_manual_section_service.add_section(
            ctx.organization_id, ctx.user_id, manual_id,
            title=payload.title, body=payload.body,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.TooManySectionsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# PUT order before the {section_id} routes is unnecessary (methods differ), but
# keeping the literal-segment route here documents that "order" is reserved.
@router.put(
    "/{manual_id}/sections/order",
    response_model=list[WelcomeManualSectionResponse],
)
async def reorder_sections(
    manual_id: uuid.UUID,
    payload: WelcomeManualSectionReorderRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> list[WelcomeManualSectionResponse]:
    try:
        return await welcome_manual_section_service.reorder_sections(
            ctx.organization_id, ctx.user_id, manual_id, payload.section_ids,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.InvalidReorderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/{manual_id}/sections/{section_id}",
    response_model=WelcomeManualSectionResponse,
)
async def update_section(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: WelcomeManualSectionUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualSectionResponse:
    try:
        return await welcome_manual_section_service.update_section(
            ctx.organization_id, ctx.user_id, manual_id, section_id,
            payload.to_update_dict(),
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc


@router.delete(
    "/{manual_id}/sections/{section_id}",
    status_code=204,
)
async def delete_section(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await welcome_manual_section_service.delete_section(
            ctx.organization_id, ctx.user_id, manual_id, section_id,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Section images
# ---------------------------------------------------------------------------


@router.post(
    "/{manual_id}/sections/{section_id}/images",
    response_model=list[WelcomeManualSectionImageResponse],
    status_code=201,
)
async def upload_section_images(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> list[WelcomeManualSectionImageResponse]:
    payloads: list[tuple[bytes, str | None, str | None]] = []
    for f in files:
        content = await f.read()
        payloads.append((content, f.filename, f.content_type))
    try:
        return await welcome_manual_section_image_service.upload_images(
            ctx.organization_id, ctx.user_id, manual_id, section_id, payloads,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_image_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except welcome_manual_section_image_service.ImageRejected as exc:
        # 413 (payload too large) for size; 415 for everything else.
        status = 413 if "MB" in exc.reason else 415
        raise HTTPException(status_code=status, detail=exc.reason) from exc


@router.patch(
    "/{manual_id}/sections/{section_id}/images/{image_id}",
    response_model=WelcomeManualSectionImageResponse,
)
async def update_section_image(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: WelcomeManualSectionImageUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualSectionImageResponse:
    try:
        return await welcome_manual_section_image_service.update_image(
            ctx.organization_id, ctx.user_id, manual_id, section_id, image_id,
            payload.to_update_dict(),
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_image_service.ImageNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc


@router.delete(
    "/{manual_id}/sections/{section_id}/images/{image_id}",
    status_code=204,
)
async def delete_section_image(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    image_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await welcome_manual_section_image_service.delete_image(
            ctx.organization_id, ctx.user_id, manual_id, section_id, image_id,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_image_service.ImageNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
    return Response(status_code=204)
