"""HTTP routes for the MyRecipes domain — recipes, version history, cook logs.

Every endpoint requires an authenticated user (``current_active_user``) and is
tenant-scoped: a recipe/version/cook owned by another user yields 404 (no
existence leak), like the canonical apps. Handlers are thin — they delegate to
``recipe_service`` and translate ``None`` -> 404 and ``InvalidBaseVersionError``
-> 400.

Path map::

    GET    /recipes                                   list (summaries)
    POST   /recipes                                   create recipe + v1
    GET    /recipes/{id}                              detail (summary + latest version)
    PATCH  /recipes/{id}                              edit metadata (title/desc/source)
    DELETE /recipes/{id}                              soft-delete
    GET    /recipes/{id}/versions                     timeline (version summaries)
    POST   /recipes/{id}/versions                     tweak -> new version
    GET    /recipes/{id}/versions/{vid}               full version
    GET    /recipes/{id}/versions/{vid}/diff          diff vs parent (or ?against=)
    POST   /recipes/{id}/versions/{vid}/restore       copy old version forward
    POST   /recipes/{id}/versions/{vid}/cooks         log a cook (rating/notes)
    GET    /recipes/{id}/versions/{vid}/cooks         cooks for a version
    GET    /recipes/{id}/cooks                        cooks across the recipe
    DELETE /recipes/{id}/cooks/{cook_id}              delete a cook log
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.recipe.cook_log_schemas import CookLogCreateRequest, CookLogResponse
from app.schemas.recipe.diff_schemas import DiffResponse
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
from app.services.recipe import recipe_service
from app.services.recipe.recipe_service import InvalidBaseVersionError

router = APIRouter(prefix="/recipes", tags=["recipes"])

_RECIPE_NOT_FOUND = "Recipe not found"
_VERSION_NOT_FOUND = "Version not found"
_COOK_NOT_FOUND = "Cook log not found"


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------


@router.get("", response_model=list[RecipeSummary])
async def list_recipes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    search: str | None = Query(default=None, description="Case-insensitive title filter"),
) -> list[RecipeSummary]:
    return await recipe_service.list_recipes(db, user.id, search=search)


@router.post("", response_model=RecipeDetailResponse, status_code=201)
async def create_recipe(
    payload: RecipeCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeDetailResponse:
    return await recipe_service.create_recipe(db, user.id, payload)


@router.get("/{recipe_id}", response_model=RecipeDetailResponse)
async def get_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeDetailResponse:
    detail = await recipe_service.get_recipe_detail(db, user.id, recipe_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return detail


@router.patch("/{recipe_id}", response_model=RecipeDetailResponse)
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


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await recipe_service.delete_recipe(db, user.id, recipe_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


@router.get("/{recipe_id}/versions", response_model=list[VersionSummary])
async def list_versions(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[VersionSummary]:
    versions = await recipe_service.list_versions(db, user.id, recipe_id)
    if versions is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return versions


@router.post("/{recipe_id}/versions", response_model=VersionResponse, status_code=201)
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


@router.get("/{recipe_id}/versions/{version_id}", response_model=VersionResponse)
async def get_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> VersionResponse:
    version = await recipe_service.get_version(db, user.id, recipe_id, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return version


@router.get("/{recipe_id}/versions/{version_id}/diff", response_model=DiffResponse)
async def diff_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    against: uuid.UUID | None = Query(
        default=None,
        description="Version to compare against. Defaults to this version's parent.",
    ),
) -> DiffResponse:
    try:
        diff = await recipe_service.diff_versions(db, user.id, recipe_id, version_id, against)
    except InvalidBaseVersionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if diff is None:
        raise HTTPException(status_code=404, detail=_VERSION_NOT_FOUND)
    return diff


@router.post(
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
# Cook logs
# ---------------------------------------------------------------------------


@router.post(
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


@router.get(
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


@router.get("/{recipe_id}/cooks", response_model=list[CookLogResponse])
async def list_recipe_cooks(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[CookLogResponse]:
    cooks = await recipe_service.list_cooks(db, user.id, recipe_id, None)
    if cooks is None:
        raise HTTPException(status_code=404, detail=_RECIPE_NOT_FOUND)
    return cooks


@router.delete("/{recipe_id}/cooks/{cook_id}", status_code=204)
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
