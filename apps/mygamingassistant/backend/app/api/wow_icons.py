"""WoW Forever icons — public, both modes (serve-only prod included).

    GET /api/wow/icons/{build}/{fileDataId}.webp

The in-game icon the WoW pages show next to an item or spell name
(``app/services/wow/icon_service.py``). The URL names the client build, so a
response never changes: cached for a year. An icon that isn't published is a
404 the browser may not keep, so it shows up once it is.
"""
from typing import Final

from fastapi import APIRouter, HTTPException, Response

from app.services.wow import icon_service

router = APIRouter(tags=["wow"])

_CACHE_FOUND: Final = "public, max-age=31536000, immutable"


@router.get(
    "/wow/icons/{build}/{file_name}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
async def get_icon(build: str, file_name: str) -> Response:
    body = await icon_service.icon_bytes(build, file_name)
    if body is None:
        raise HTTPException(status_code=404, detail="Not Found", headers={"Cache-Control": "no-store"})
    return Response(content=body, media_type="image/webp", headers={"Cache-Control": _CACHE_FOUND})
