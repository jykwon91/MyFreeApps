"""The calls every Blizzard API client makes the same way.

Each client passes its own error class (a ``BlizzardApiError`` subclass), so
its callers keep catching the error they already know. The credentials are
never logged or put in an error.
"""
from __future__ import annotations

import json
from typing import Any, TypeVar

import httpx

from app.core.wow_prices import BLIZZARD_TOKEN_URL
from app.services.wow.blizzard.blizzard_api_error import BlizzardApiError
from app.services.wow.blizzard.blizzard_token import BlizzardToken

USER_AGENT = "MyGamingAssistant/1.0 (+https://mygamingassistant.myfreeapps.org/wow-forever)"
_REASON_MAX = 200
# Blizzard says 86399 s; a token whose answer doesn't say is treated as an hour.
_DEFAULT_TOKEN_SECONDS = 3600

E = TypeVar("E", bound=BlizzardApiError)


def error_from(response: httpx.Response, error_cls: type[E]) -> E:
    """Blizzard's error body → an error with its code, whatever shape it came in."""
    code: str | None = None
    reason = response.reason_phrase or "request failed"
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        # Game Data / Profile API: {"code": 404, "type": "BLZWEBAPI00000404", "detail": "Not Found"}
        # OAuth: {"error": "invalid_client", "error_description": "..."}
        raw_code = body.get("type") or body.get("error")
        code = str(raw_code) if raw_code else None
        detail = body.get("detail") or body.get("error_description")
        if detail:
            reason = str(detail)
    elif response.text:
        reason = response.text
    return error_cls(reason[:_REASON_MAX], status_code=response.status_code, code=code)


async def send(
    http: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    error_cls: type[E],
    max_bytes: int,
    **kwargs: Any,
) -> httpx.Response:
    """One request; anything but a 200 under ``max_bytes`` raises ``error_cls``."""
    try:
        response = await http.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        raise error_cls(f"request failed: {type(exc).__name__}") from exc
    if response.status_code != httpx.codes.OK:
        raise error_from(response, error_cls)
    if len(response.content) > max_bytes:
        raise error_cls(f"answer is {len(response.content)} bytes, over the {max_bytes} cap", status_code=200)
    return response


def json_object(response: httpx.Response, error_cls: type[E]) -> dict[str, Any]:
    try:
        body = json.loads(response.content)
    except ValueError as exc:
        raise error_cls("answer is not JSON", status_code=response.status_code) from exc
    if not isinstance(body, dict):
        raise error_cls("answer is not a JSON object", status_code=response.status_code)
    return body


async def fetch_client_token(
    http: httpx.AsyncClient,
    credentials: tuple[str, str],
    *,
    error_cls: type[E],
    max_bytes: int,
) -> BlizzardToken:
    """``POST https://oauth.battle.net/token`` with client credentials (HTTP Basic)."""
    response = await send(
        http, "POST", BLIZZARD_TOKEN_URL,
        error_cls=error_cls, max_bytes=max_bytes,
        data={"grant_type": "client_credentials"}, auth=credentials,
    )
    body = json_object(response, error_cls)
    token = body.get("access_token")
    if not isinstance(token, str) or not token:
        raise error_cls("token answer has no access_token", status_code=response.status_code)
    expires_in = body.get("expires_in")
    seconds = expires_in if isinstance(expires_in, int) and expires_in > 0 else _DEFAULT_TOKEN_SECONDS
    return BlizzardToken(value=token, expires_in=seconds)
