"""Blizzard's Profile API for WoW Forever characters (US).

* ``GET /profile/wow/character/{slug}`` → name, level, race, class, guild…
* ``GET /profile/wow/character/{slug}/character-media`` → render image URLs.
* ``GET /profile/wow/character/{slug}/equipment`` → equipped items with the
  stats they rolled.

All in the ``profile-forever-us`` namespace with a client-credentials token
(no player login). Every failure becomes a ``CharacterLookupError`` carrying
Blizzard's status and code; a 404 on the profile means no such character.
"""
from __future__ import annotations

from types import TracebackType
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.wow_character import (
    CHARACTER_MAX_JSON_BYTES,
    CHARACTER_MAX_RENDER_BYTES,
    CHARACTER_NAMESPACE,
    CHARACTER_PATH,
    CHARACTER_RENDER_HOST,
    CHARACTER_TIMEOUT_SECONDS,
)
from app.core.wow_prices import BLIZZARD_API_BASE, BLIZZARD_LOCALE
from app.services.wow.blizzard.blizzard_http import USER_AGENT, fetch_client_token, json_object, send
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character.character_lookup_error import CharacterLookupError


class BlizzardCharacterClient:
    """``async with BlizzardCharacterClient(id, secret, tokens) as client:``."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        tokens: BlizzardTokenCache,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not client_id or not client_secret:
            raise CharacterLookupError("BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are not set")
        self._credentials = (client_id, client_secret)
        self._tokens = tokens
        # Tests pass an httpx.MockTransport; production uses the default.
        self._transport = transport
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> BlizzardCharacterClient:
        self._http = httpx.AsyncClient(
            transport=self._transport,
            timeout=CHARACTER_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._http is not None:
            await self._http.aclose()

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            raise RuntimeError("BlizzardCharacterClient used outside `async with`")
        return self._http

    async def _token(self) -> str:
        http = self._client()
        return await self._tokens.get(
            lambda: fetch_client_token(
                http, self._credentials, error_cls=CharacterLookupError, max_bytes=CHARACTER_MAX_JSON_BYTES,
            )
        )

    async def _profile_json(self, path: str) -> dict[str, Any]:
        token = await self._token()
        try:
            response = await send(
                self._client(),
                "GET",
                f"{BLIZZARD_API_BASE}{CHARACTER_PATH}/{path}",
                error_cls=CharacterLookupError,
                max_bytes=CHARACTER_MAX_JSON_BYTES,
                params={"namespace": CHARACTER_NAMESPACE, "locale": BLIZZARD_LOCALE},
                headers={"Authorization": f"Bearer {token}"},
            )
        except CharacterLookupError as exc:
            if exc.status_code == httpx.codes.UNAUTHORIZED:
                # Blizzard dropped the token early: the next lookup asks for a new one.
                self._tokens.clear()
            raise
        return json_object(response, CharacterLookupError)

    async def _optional_json(self, path: str) -> dict[str, Any] | None:
        """A sub-resource that some characters don't have yet (404 → None)."""
        try:
            return await self._profile_json(path)
        except CharacterLookupError as exc:
            if exc.status_code == httpx.codes.NOT_FOUND:
                return None
            raise

    async def profile(self, slug: str) -> dict[str, Any]:
        return await self._profile_json(slug)

    async def media(self, slug: str) -> dict[str, Any] | None:
        return await self._optional_json(f"{slug}/character-media")

    async def equipment(self, slug: str) -> dict[str, Any] | None:
        return await self._optional_json(f"{slug}/equipment")

    async def render(self, url: str) -> bytes | None:
        """The render PNG — only from Blizzard's render host, over HTTPS (404 → None)."""
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname != CHARACTER_RENDER_HOST:
            raise CharacterLookupError(f"render URL is not on {CHARACTER_RENDER_HOST}")
        try:
            response = await send(
                self._client(), "GET", url, error_cls=CharacterLookupError, max_bytes=CHARACTER_MAX_RENDER_BYTES,
            )
        except CharacterLookupError as exc:
            # The profile listed a render the render host doesn't have: no picture, not "no character".
            if exc.status_code == httpx.codes.NOT_FOUND:
                return None
            raise
        return response.content
