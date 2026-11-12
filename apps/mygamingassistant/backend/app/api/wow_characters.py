"""WoW Forever "Your character" — PUBLIC, both serve-only and full-auth mode.

GET /wow/characters/{slug}             — the character sheet (gear with rolled stats)
GET /wow/characters/{slug}/render.png  — Blizzard's render, cropped to the character

``slug`` is ``first-surname`` (Forever characters have no realm). Blizzard's
Profile API is read with MGA's client-credentials token — no player login —
and answers are cached in-process for a few minutes.

Errors:
  - 400 — the slug isn't two names of letters
  - 404 — no character by that name (or no render for it)
  - 429 — too many lookups from this IP
  - 502 — Blizzard couldn't be reached or answered with an error
"""
import logging

from fastapi import APIRouter, HTTPException, Request, Response, status

from platform_shared.core.request_utils import get_client_ip

from app.core.rate_limit import RateLimiter, check_with_retry_after
from app.core.wow_character import CHARACTER_CACHE_SECONDS, CHARACTER_RATE_LIMIT, CHARACTER_RATE_WINDOW_SECONDS
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character import character_service
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.character.character_slug import normalize_character_slug

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wow/characters", tags=["wow"])

character_limiter = RateLimiter(max_attempts=CHARACTER_RATE_LIMIT, window_seconds=CHARACTER_RATE_WINDOW_SECONDS)

CHARACTER_NOT_FOUND = "character_not_found"
CHARACTER_RENDER_NOT_FOUND = "character_render_not_found"
CHARACTER_UPSTREAM_FAILED = "character_upstream_failed"
_CACHE_CONTROL = f"public, max-age={CHARACTER_CACHE_SECONDS}"


def _slug_or_400(raw: str) -> str:
    slug = normalize_character_slug(raw)
    if slug is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Give the character's first name and surname.")
    return slug


def _upstream_error(slug: str, exc: CharacterLookupError) -> HTTPException:
    if exc.status_code == status.HTTP_404_NOT_FOUND:
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=CHARACTER_NOT_FOUND)
    logger.warning("wow character %s: Blizzard lookup failed: %s", slug, exc.summary())
    return HTTPException(status.HTTP_502_BAD_GATEWAY, detail=CHARACTER_UPSTREAM_FAILED)


@router.get("/{slug}", response_model=CharacterResponse)
async def get_character(slug: str, request: Request, response: Response) -> CharacterResponse:
    slug = _slug_or_400(slug)
    check_with_retry_after(character_limiter, f"wow-character:{get_client_ip(request)}")
    try:
        character = await character_service.get_character(slug)
    except CharacterLookupError as exc:
        raise _upstream_error(slug, exc) from exc
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return character


@router.get("/{slug}/render.png", response_class=Response)
async def get_character_render(slug: str) -> Response:
    # Not rate limited on its own: it rides the sheet's cached lookup, and
    # an uncached one is the same Blizzard calls the sheet makes.
    slug = _slug_or_400(slug)
    try:
        png = await character_service.get_character_render(slug)
    except CharacterLookupError as exc:
        raise _upstream_error(slug, exc) from exc
    if png is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=CHARACTER_RENDER_NOT_FOUND)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": _CACHE_CONTROL})
