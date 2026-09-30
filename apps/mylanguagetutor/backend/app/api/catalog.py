"""Read-only catalog routes: supported languages and conversation scenarios.

    GET /languages                  supported target languages
    GET /scenarios?language=es      scenarios for a language (422 if unsupported)

Auth is enforced at the ROUTER level (verified users only) so a newly added
handler cannot regress to unauthenticated.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import current_active_user
from app.schemas.tutor.catalog_schemas import LanguageResponse, ScenarioResponse
from app.services.tutor import catalog_service
from app.services.tutor.catalog_service import UnknownLanguageError

languages_router = APIRouter(
    prefix="/languages",
    tags=["catalog"],
    dependencies=[Depends(current_active_user)],
)

scenarios_router = APIRouter(
    prefix="/scenarios",
    tags=["catalog"],
    dependencies=[Depends(current_active_user)],
)


@languages_router.get("", response_model=list[LanguageResponse])
async def list_languages() -> list[LanguageResponse]:
    return catalog_service.get_languages()


@scenarios_router.get("", response_model=list[ScenarioResponse])
async def list_scenarios(
    language: str = Query(min_length=1, max_length=8, description="Language code, e.g. 'es'"),
) -> list[ScenarioResponse]:
    try:
        return catalog_service.get_scenarios(language)
    except UnknownLanguageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
