import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.listings.listing_create_request import ListingCreateRequest
from app.schemas.listings.listing_external_id_create_request import (
    ListingExternalIdCreateRequest,
)
from app.schemas.listings.listing_external_id_response import ListingExternalIdResponse
from app.schemas.listings.listing_external_id_update_request import (
    ListingExternalIdUpdateRequest,
)
from app.schemas.listings.listing_list_response import ListingListResponse
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.schemas.listings.listing_photo_update_request import ListingPhotoUpdateRequest
from app.schemas.listings.listing_response import ListingResponse
from app.schemas.listings.listing_update_request import ListingUpdateRequest
from app.services.listings import (
    listing_external_id_service,
    listing_photo_service,
    listing_service,
)
from app.services.storage.image_processor import ImageRejected

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("", response_model=ListingListResponse)
async def list_listings(
    status: str | None = Query(None, description="Optional status filter"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> ListingListResponse:
    return await listing_service.list_listings(
        ctx.organization_id, ctx.user_id, status=status, limit=limit, offset=offset,
    )


@router.post("", response_model=ListingResponse, status_code=201)
async def create_listing(
    payload: ListingCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ListingResponse:
    try:
        return await listing_service.create_listing(ctx.organization_id, ctx.user_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{listing_id}", response_model=ListingResponse)
async def get_listing(
    listing_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> ListingResponse:
    try:
        return await listing_service.get_listing(ctx.organization_id, ctx.user_id, listing_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc


@router.put("/{listing_id}", response_model=ListingResponse)
async def update_listing(
    listing_id: uuid.UUID,
    payload: ListingUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ListingResponse:
    try:
        return await listing_service.update_listing(
            ctx.organization_id, ctx.user_id, listing_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{listing_id}", status_code=204)
async def delete_listing(
    listing_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await listing_service.soft_delete_listing(ctx.organization_id, ctx.user_id, listing_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    return Response(status_code=204)


@router.post(
    "/{listing_id}/photos",
    response_model=list[ListingPhotoResponse],
    status_code=201,
)
async def upload_photos(
    listing_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> list[ListingPhotoResponse]:
    payloads: list[tuple[bytes, str | None, str | None]] = []
    for f in files:
        content = await f.read()
        payloads.append((content, f.filename, f.content_type))
    try:
        return await listing_photo_service.upload_photos(
            ctx.organization_id, ctx.user_id, listing_id, payloads,
        )
    except listing_photo_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except listing_photo_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ImageRejected as exc:
        # 413 (payload too large) for size; 415 for everything else.
        status = 413 if "MB" in exc.reason else 415
        raise HTTPException(status_code=status, detail=exc.reason) from exc


@router.patch(
    "/{listing_id}/photos/{photo_id}",
    response_model=ListingPhotoResponse,
)
async def update_photo(
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    payload: ListingPhotoUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ListingPhotoResponse:
    try:
        return await listing_photo_service.update_photo(
            ctx.organization_id, ctx.user_id, listing_id, photo_id, payload.to_update_dict(),
        )
    except listing_photo_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/{listing_id}/photos/{photo_id}",
    status_code=204,
)
async def delete_photo(
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await listing_photo_service.delete_photo(
            ctx.organization_id, ctx.user_id, listing_id, photo_id,
        )
    except listing_photo_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post(
    "/{listing_id}/external-ids",
    response_model=ListingExternalIdResponse,
    status_code=201,
)
async def create_external_id(
    listing_id: uuid.UUID,
    payload: ListingExternalIdCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ListingExternalIdResponse:
    try:
        return await listing_external_id_service.create_external_id(
            ctx.organization_id, ctx.user_id, listing_id, payload,
        )
    except listing_external_id_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except listing_external_id_service.SourceAlreadyLinkedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except listing_external_id_service.ExternalIdAlreadyClaimedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch(
    "/{listing_id}/external-ids/{external_id_pk}",
    response_model=ListingExternalIdResponse,
)
async def update_external_id(
    listing_id: uuid.UUID,
    external_id_pk: uuid.UUID,
    payload: ListingExternalIdUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ListingExternalIdResponse:
    try:
        return await listing_external_id_service.update_external_id(
            ctx.organization_id, ctx.user_id, listing_id, external_id_pk, payload,
        )
    except listing_external_id_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except listing_external_id_service.ExternalIdNotFoundError as exc:
        raise HTTPException(status_code=404, detail="External ID not found") from exc
    except listing_external_id_service.ExternalIdAlreadyClaimedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete(
    "/{listing_id}/external-ids/{external_id_pk}",
    status_code=204,
)
async def delete_external_id(
    listing_id: uuid.UUID,
    external_id_pk: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await listing_external_id_service.delete_external_id(
            ctx.organization_id, ctx.user_id, listing_id, external_id_pk,
        )
    except listing_external_id_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except listing_external_id_service.ExternalIdNotFoundError as exc:
        raise HTTPException(status_code=404, detail="External ID not found") from exc
    return Response(status_code=204)
