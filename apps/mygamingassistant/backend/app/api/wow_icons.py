"""WoW Forever images — public, both modes (serve-only prod included).

    GET /api/wow/icons/{build}/{fileDataId}.webp
    GET /api/wow/satellite/{build}/{uiMapId}.webp

The in-game icon the WoW pages show next to an item or spell name, and a
zone's satellite view for the World Map (``app/services/wow/icon_service.py``).
The URL names the client build, so a response never changes: cached for a
year. An image that isn't published is a 404 the browser may not keep, so it
shows up once it is.
"""
from typing import Final

from fastapi import APIRouter, HTTPException, Response

from app.services.wow import icon_service

router = APIRouter(tags=["wow"])

_CACHE_FOUND: Final = "public, max-age=31536000, immutable"
_RESPONSES: Final = {200: {"content": {"image/webp": {}}}}


async def _image(kind: str, build: str, file_name: str) -> Response:
    body = await icon_service.asset_bytes(kind, build, file_name)
    if body is None:
        raise HTTPException(status_code=404, detail="Not Found", headers={"Cache-Control": "no-store"})
    return Response(content=body, media_type="image/webp", headers={"Cache-Control": _CACHE_FOUND})


@router.get("/wow/icons/{build}/{file_name}", response_class=Response, responses=_RESPONSES)
async def get_icon(build: str, file_name: str) -> Response:
    return await _image(icon_service.ICONS, build, file_name)


@router.get("/wow/satellite/{build}/{file_name}", response_class=Response, responses=_RESPONSES)
async def get_satellite(build: str, file_name: str) -> Response:
    return await _image(icon_service.SATELLITE, build, file_name)
