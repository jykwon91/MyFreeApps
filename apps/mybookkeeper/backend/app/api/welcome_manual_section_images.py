"""Welcome-manual section image routes: upload, reorder, caption and delete the photos of one section.
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.schemas.welcome_manuals.welcome_manual_section_image_reorder_request import (
    WelcomeManualSectionImageReorderRequest,
)
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_image_update_request import (
    WelcomeManualSectionImageUpdateRequest,
)
from app.services.welcome_manuals import (
    welcome_manual_section_image_service,
    welcome_manual_section_service,
)

router = APIRouter(prefix="/welcome-manuals", tags=["welcome-manuals"])


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
    except welcome_manual_section_image_service.TooManyImagesError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except welcome_manual_section_image_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except welcome_manual_section_image_service.ImageRejected as exc:
        # 413 (payload too large) for size; 415 for everything else.
        status = 413 if "MB" in exc.reason else 415
        raise HTTPException(status_code=status, detail=exc.reason) from exc


@router.put(
    "/{manual_id}/sections/{section_id}/images/order",
    response_model=list[WelcomeManualSectionImageResponse],
)
async def reorder_section_images(
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: WelcomeManualSectionImageReorderRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> list[WelcomeManualSectionImageResponse]:
    try:
        return await welcome_manual_section_image_service.reorder_images(
            ctx.organization_id, ctx.user_id, manual_id, section_id, payload.image_ids,
        )
    except welcome_manual_section_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_section_service.SectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Section not found") from exc
    except welcome_manual_section_image_service.InvalidImageReorderError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
