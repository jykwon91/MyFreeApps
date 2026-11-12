"""Your character: fetch the character from Blizzard, then store what was fetched.

The page always shows Blizzard's answer (through ``character_service``'s
few-minute cache), exactly as before storing existed. Storing happens after a
fresh fetch, a 404 or a failure, and never breaks the page: a database error
there is logged with its traceback and the sheet is still returned.
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable
from http import HTTPStatus

from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character import character_service, character_store_service
from app.services.wow.character.character_lookup_error import CharacterLookupError

logger = logging.getLogger(__name__)


async def _store_quietly(slug: str, write: Awaitable[None]) -> None:
    try:
        await write
    except Exception:
        logger.exception("Character %s: storing the look-up failed (the page is still served)", slug)


async def get_character(slug: str) -> CharacterResponse:
    """Raises ``CharacterLookupError`` (status 404 = no character by that name)."""
    try:
        fetch = await character_service.fetch_character(slug)
    except CharacterLookupError as exc:
        if exc.status_code == HTTPStatus.NOT_FOUND:
            await _store_quietly(slug, character_store_service.mark_gone(slug))
        else:
            await _store_quietly(slug, character_store_service.record_failure(slug, exc.summary()))
        raise
    if fetch.fresh:
        await _store_quietly(slug, character_store_service.record(fetch))
    return fetch.response


async def get_character_render(slug: str) -> bytes | None:
    """The cropped render. The look-up goes through ``get_character`` first, so a
    render that is the first request for a character still stores it."""
    await get_character(slug)
    return await character_service.get_character_render(slug)
