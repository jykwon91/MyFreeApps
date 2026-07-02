"""HTTP routes for the MyRecipes domain — recipes, version history, cook logs.

MyRecipes uses **public-read / auth-write** routing (mirrors MyGamingAssistant;
see apps/myrecipes/CLAUDE.md and apps/mygamingassistant/CLAUDE.md → Authentication
Model). This module exports two routers:

    ``public_router`` — no auth dependency; anyone may browse the library:
        GET /recipes                                  list (summaries)
        GET /recipes/{id}                             detail (summary + latest version)
        GET /recipes/{id}/versions                    timeline (version summaries)
        GET /recipes/{id}/versions/{vid}              full version
        GET /recipes/{id}/versions/{vid}/diff         diff vs parent (or ?against=)

    ``auth_router`` — ``Depends(current_active_user)`` at the ROUTER level (never
    per-handler, so a newly added write handler cannot regress to "no auth"):
        POST   /recipes                               create recipe + v1
        POST   /recipes/extract                       photo -> draft (Claude vision)
        PATCH  /recipes/{id}                          edit metadata
        DELETE /recipes/{id}                          soft-delete
        POST   /recipes/{id}/versions                 tweak -> new version
        POST   /recipes/{id}/versions/{vid}/restore   copy old version forward
        POST   /recipes/{id}/versions/{vid}/cooks     log a cook (rating/notes)
        GET    /recipes/{id}/versions/{vid}/cooks     cooks for a version (owner-only)
        GET    /recipes/{id}/cooks                    cooks across the recipe (owner-only)
        DELETE /recipes/{id}/cooks/{cook_id}          delete a cook log

Security shape:
- Public responses never carry ``user_id``. The service computes ``is_owner``
  against the OPTIONAL viewer (``current_user_optional``) plus the owner's public
  ``owner_display_name``. Cook-log rollups are owner-private (null for non-owners).
- Cook logs are PRIVATE (owner-only) — all ``/cooks`` endpoints are auth-gated
  and tenant-scoped; another user's cooks yield 404 (no existence leak).
- Public reads use the service's dedicated public functions, which are NOT
  tenant-scoped; every WRITE keeps threading ``user.id`` (cross-tenant -> 404).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user, current_user_optional
from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.recipe.cook_log_schemas import CookLogCreateRequest, CookLogResponse
from app.schemas.recipe.diff_schemas import DiffResponse
from app.schemas.recipe.extraction_schemas import RecipeDraftResponse
from app.schemas.recipe.recipe_schemas import (
    RecipeCreateRequest,
    RecipeDetailResponse,
    RecipeSummary,
    RecipeUpdateRequest,
)
from app.schemas.recipe.version_schemas import (
    VersionCreateRequest,
    VersionResponse,
    VersionSummary,
)
from app.services.recipe import photo_extraction_service, recipe_service
from app.services.recipe.recipe_service import InvalidBaseVersionError

# Public read-only routes — no auth required.
public_router = APIRouter(prefix="/recipes", tags=["recipes"])

# Auth-required mutations + owner-only cook logs. Auth is enforced at the router
# level rather than per-handler so gating cannot accidentally regress when new
# handlers are added.
auth_router = APIRouter(
    prefix="/recipes",
    tags=["recipes"],
    dependencies=[Depends(current_active_user)],
)

_RECIPE_NOT_FOUND = "Recipe not found"
_VERSION_NOT_FOUND = "Version not found"
_COOK_NOT_FOUND = "Cook log not found"


# ===========================================================================
# Public routes — read-only, not tenant-scoped
# ===========================================================================


@public_router.get("", response_model=list[RecipeSummary])
async def list_recipes(
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(current_user_optional),
    search: str | None = Query(default=None, description="Case-insensitive title filter"),
    owner: str | None = Query(
        default=None,
        description="Set to 'me' to list only your own recipes (requires auth).",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[RecipeSummary]:
    """List recipes. Public — no auth required.

    ``owner=me`` scopes the list to the authenticated viewer's own recipes and
    responds 401 if used anonymously. Rollups (best_rating/last_cooked_at) are
    populated only on recipes the viewer owns.
    """
    if owner is not None and owner != "me":
        raise HTTPException(status_code=422, detail="owner must be 'me' when provided")
    owner_me = owner == "me"
    if owner_me and viewer is None:
        raise HTTPException(
            status_code=401, detail="Authentication required for owner=me"
        )
    viewer_id = viewer.id if viewer is not None else None
    return await recipe_service.list_public_recipes(
        db, viewer_id, search=search, limit=limit, offset=offset, owner_me=owner_me,
    )


@public_router.get("/{recipe_id}", response_model=RecipeDetailResponse)
async def get_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(current_user_optional),
) -> RecipeDetailResponse:
    viewer_id = viewer.id if viewer is not None else None
    detail = await recipe_service.get_public_recipe_detail(db, viewer_id, recipe_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return detail


@public_router.get("/{recipe_id}/versions", response_model=list[VersionSummary])
async def list_versions(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(current_user_optional),
) -> list[VersionSummary]:
    viewer_id = viewer.id if viewer is not None else None
    versions = await recipe_service.list_public_versions(db, viewer_id, recipe_id)
    if versions is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return versions


@public_router.get("/{recipe_id}/versions/{version_id}", response_model=VersionResponse)
async def get_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> VersionResponse:
    version = await recipe_service.get_public_version(db, recipe_id, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return version


@public_router.get("/{recipe_id}/versions/{version_id}/diff", response_model=DiffResponse)
async def diff_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    against: uuid.UUID | None = Query(
        default=None,
        description="Version to compare against. Defaults to this version's parent.",
    ),
) -> DiffResponse:
    try:
        diff = await recipe_service.diff_public_versions(db, recipe_id, version_id, against)
    except InvalidBaseVersionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if diff is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return diff


# ===========================================================================
# Auth-required routes — writes + owner-only cook logs
# ===========================================================================


@auth_router.post("", response_model=RecipeDetailResponse, status_code=201)
async def create_recipe(
    payload: RecipeCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeDetailResponse:
    return await recipe_service.create_recipe(db, user.id, payload)


@auth_router.post("/extract", response_model=RecipeDraftResponse)
async def extract_recipe_photo(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
) -> RecipeDraftResponse:
    """Extract an editable recipe draft from an uploaded photo (Claude vision).

    The image is a transient input — it is never stored. The returned draft is
    for the user to review and edit; saving happens through ``POST /recipes``.
    Status codes: 413 too large, 415 unsupported type, 422 unreadable / no
    recipe found, 503 photo import not available.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")
    if len(content) > settings.max_photo_upload_bytes:
        limit_mb = settings.max_photo_upload_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Image exceeds the {limit_mb} MB limit.")
    if (file.content_type or "") not in photo_extraction_service.SUPPORTED_MEDIA_TYPES:
        raise HTTPException(
            status_code=415, detail="Unsupported image type. Use JPEG, PNG, or WebP."
        )
    try:
        return await photo_extraction_service.extract_recipe_from_photo(
            content, file.content_type or ""
        )
    except photo_extraction_service.PhotoExtractionUnavailableError as exc:
        raise HTTPException(
            status_code=503, detail="Photo import is not available right now."
        ) from exc
    except photo_extraction_service.PhotoNotReadableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@auth_router.patch("/{recipe_id}", response_model=RecipeDetailResponse)
async def update_recipe(
    recipe_id: uuid.UUID,
    payload: RecipeUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeDetailResponse:
    detail = await recipe_service.update_recipe(db, user.id, recipe_id, payload)
    if detail is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return detail


@auth_router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await recipe_service.delete_recipe(db, user.id, recipe_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return Response(status_code=204)


@auth_router.post("/{recipe_id}/versions", response_model=VersionResponse, status_code=201)
async def create_version(
    recipe_id: uuid.UUID,
    payload: VersionCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> VersionResponse:
    try:
        version = await recipe_service.create_version(db, user.id, recipe_id, payload)
    except InvalidBaseVersionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if version is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return version


@auth_router.post(
    "/{recipe_id}/versions/{version_id}/restore",
    response_model=VersionResponse,
    status_code=201,
)
async def restore_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> VersionResponse:
    version = await recipe_service.restore_version(db, user.id, recipe_id, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return version


# ---------------------------------------------------------------------------
# Cook logs — PRIVATE (owner-only). Never public.
# ---------------------------------------------------------------------------


@auth_router.post(
    "/{recipe_id}/versions/{version_id}/cooks",
    response_model=CookLogResponse,
    status_code=201,
)
async def log_cook(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: CookLogCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CookLogResponse:
    cook = await recipe_service.log_cook(db, user.id, recipe_id, version_id, payload)
    if cook is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return cook


@auth_router.get(
    "/{recipe_id}/versions/{version_id}/cooks",
    response_model=list[CookLogResponse],
)
async def list_version_cooks(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[CookLogResponse]:
    cooks = await recipe_service.list_cooks(db, user.id, recipe_id, version_id)
    if cooks is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return cooks


@auth_router.get("/{recipe_id}/cooks", response_model=list[CookLogResponse])
async def list_recipe_cooks(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[CookLogResponse]:
    cooks = await recipe_service.list_cooks(db, user.id, recipe_id, None)
    if cooks is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return cooks


@auth_router.delete("/{recipe_id}/cooks/{cook_id}", status_code=204)
async def delete_cook(
    recipe_id: uuid.UUID,
    cook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await recipe_service.delete_cook(db, user.id, recipe_id, cook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_COOK_NOT_FOUND)
    return Response(status_code=204)
