"""Blizzard's Game Data API, read for the talent build (``static-forever-us``).

* ``POST https://oauth.battle.net/token`` (client credentials, HTTP Basic) →
  a bearer token, one per run.
* ``GET /data/wow/talent-tree/index`` → ``spec_talent_trees[]``, each spec's
  tree href; ``GET`` each → its ``spec_talent_nodes``.
* ``GET /data/wow/media/playable-specialization/{spec}`` and
  ``/data/wow/media/spell/{spell}`` → ``assets[]`` with the icon's
  ``file_data_id`` (the site serves its own copy, never Blizzard's URL).

The credentials are ``BLIZZARD_CLIENT_ID`` / ``BLIZZARD_CLIENT_SECRET``
(``backend/.env``); the run stops when they aren't set. A failed call stops
it too, with the HTTP status and Blizzard's own code (the API's ``type``, or
the OAuth ``error``). The credentials and the token are never printed.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.wow_prices import BLIZZARD_API_BASE, BLIZZARD_LOCALE, BLIZZARD_TIMEOUT_SECONDS, BLIZZARD_TOKEN_URL

STATIC_NAMESPACE = "static-forever-us"
USER_AGENT = "MyGamingAssistant/1.0 (+https://mygamingassistant.myfreeapps.org/wow-forever)"
# The versioned namespace Blizzard answers with: static-1.60.1_70399-forever-us.
_NAMESPACE_BUILD = re.compile(r"namespace=static-(\d+\.\d+\.\d+)_(\d+)-")
_REASON_MAX = 200


def blizzard_credentials() -> tuple[str, str]:
    """The client id and secret, or stop the run saying how to set them."""
    if not settings.blizzard_client_id or not settings.blizzard_client_secret:
        raise SystemExit(
            "BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are not set.\n"
            "The talent trees come from Blizzard's Game Data API, which needs a client from\n"
            "https://develop.battle.net/access/clients — put both values in backend/.env."
        )
    return settings.blizzard_client_id, settings.blizzard_client_secret


def _failure(what: str, response: httpx.Response) -> SystemExit:
    code: str | None = None
    reason = response.reason_phrase or "request failed"
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        # Game Data API: {"code": 404, "type": "BLZWEBAPI00000404", "detail": "Not Found"}
        # OAuth: {"error": "invalid_client", "error_description": "..."}
        code = str(body.get("type") or body.get("error") or "") or None
        reason = str(body.get("detail") or body.get("error_description") or reason)
    return SystemExit(f"Blizzard API {what}: HTTP {response.status_code} code={code} {reason[:_REASON_MAX]}")


def namespace_build(href: str) -> str:
    """``1.60.1.70399`` from an answer's ``_links.self.href``; "" when it names no build."""
    match = _NAMESPACE_BUILD.search(href)
    return f"{match.group(1)}.{match.group(2)}" if match else ""


class BlizzardStatic:
    """``with BlizzardStatic(id, secret) as api:`` — one token per block."""

    def __init__(self, client_id: str, client_secret: str, *, transport: httpx.BaseTransport | None = None) -> None:
        self._credentials = (client_id, client_secret)
        # Tests pass an httpx.MockTransport; the build uses the default.
        self._http = httpx.Client(transport=transport, timeout=BLIZZARD_TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT})
        self._token = ""

    def __enter__(self) -> BlizzardStatic:
        try:
            response = self._http.post(BLIZZARD_TOKEN_URL, data={"grant_type": "client_credentials"}, auth=self._credentials)
        except httpx.HTTPError as exc:
            self._http.close()
            raise SystemExit(f"Blizzard API token: request failed: {type(exc).__name__}") from exc
        if response.status_code != httpx.codes.OK:
            self._http.close()
            raise _failure("token", response)
        token = response.json().get("access_token")
        if not isinstance(token, str) or not token:
            self._http.close()
            raise SystemExit("Blizzard API token: the answer has no access_token")
        self._token = token
        return self

    def __exit__(self, *_exc: object) -> None:
        self._http.close()

    def get(self, url: str) -> dict[str, Any]:
        """One Game Data answer: a ``/data/wow/...`` path or a full href from another answer."""
        target = url.split("?")[0] if url.startswith("http") else f"{BLIZZARD_API_BASE}{url}"
        try:
            response = self._http.get(
                target,
                params={"namespace": STATIC_NAMESPACE, "locale": BLIZZARD_LOCALE},
                headers={"Authorization": f"Bearer {self._token}"},
            )
        except httpx.HTTPError as exc:
            raise SystemExit(f"Blizzard API {target}: request failed: {type(exc).__name__}") from exc
        if response.status_code != httpx.codes.OK:
            raise _failure(target, response)
        body = response.json()
        if not isinstance(body, dict):
            raise SystemExit(f"Blizzard API {target}: answer is not a JSON object")
        return body

    def talent_trees(self) -> tuple[str, list[dict[str, Any]]]:
        """The API's build and every spec's talent tree, in the index's order."""
        index = self.get("/data/wow/talent-tree/index")
        build = namespace_build(index["_links"]["self"]["href"])
        return build, [self.get(entry["key"]["href"]) for entry in index["spec_talent_trees"]]

    def icon_file(self, media_path: str) -> int:
        """The ``icon`` asset's file data id of a media answer; 0 when it has none."""
        assets = self.get(media_path).get("assets") or []
        return next((int(a["file_data_id"]) for a in assets if a.get("key") == "icon" and a.get("file_data_id")), 0)
