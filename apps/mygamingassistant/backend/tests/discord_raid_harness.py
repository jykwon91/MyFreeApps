"""Shared harness for the raid bot's end-to-end tests through POST /discord/interactions.

Every request is a real Ed25519-signed interaction payload; handlers run
against the SAVEPOINT-bound ``db`` fixture (``bound_unit_of_work`` points
every ``unit_of_work`` at it, including the background tasks).  Outbound
Discord REST is a ``httpx.MockTransport`` behind a patched
``app.services.discord.rest.make_rest_client`` — :class:`FakeDiscord`
records each call so tests assert what the bot *sent*, not how.

The ``fake_discord``, ``http`` and ``post`` fixtures live in ``conftest.py``
and are built from the pieces here.  httpx's ASGITransport awaits the whole
ASGI call, so FastAPI background tasks have finished by the time ``post``
returns.
"""
from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from platform_shared.services.discord import (
    EMBED_LINKS,
    MANAGE_EVENTS,
    MANAGE_GUILD,
    SEND_MESSAGES,
    VIEW_CHANNEL,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent

_PRIVATE_KEY = Ed25519PrivateKey.generate()
PUBLIC_KEY_HEX = _PRIVATE_KEY.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()

APP_ID = "900000000000000001"
GUILD = "800000000000000001"
CHANNEL = "700000000000000001"
ROLE = "600000000000000001"
ORGANISER = "500000000000000001"
TOKEN = "tok"

ORGANISER_PERMS = MANAGE_EVENTS | MANAGE_GUILD
NY = ZoneInfo("America/New_York")

TYPE_COMMAND = 2
TYPE_COMPONENT = 3
TYPE_AUTOCOMPLETE = 4
TYPE_MODAL_SUBMIT = 5
EPHEMERAL = 64


# ---------------------------------------------------------------------------
# Fake Discord REST
# ---------------------------------------------------------------------------


@dataclass
class Call:
    method: str
    path: str
    body: dict[str, Any] | None


@dataclass
class FakeDiscord:
    calls: list[Call] = field(default_factory=list)
    # (method, path) → (status, json body); consumed in order, falls back to default.
    errors: dict[tuple[str, str], list[tuple[int, dict[str, Any]]]] = field(default_factory=dict)
    # (method, path) → how many upcoming calls Discord never answers (httpx.ReadTimeout).
    unanswered: dict[tuple[str, str], int] = field(default_factory=dict)
    bot_channel_permissions: int = VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS
    _next_message: int = 0

    def fail(self, method: str, path: str, status: int, code: int) -> None:
        self.errors.setdefault((method, path), []).append((status, {"code": code, "message": "nope"}))

    def time_out(self, method: str, path: str) -> None:
        self.unanswered[(method, path)] = self.unanswered.get((method, path), 0) + 1

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/v10")
        body = None
        if request.content:
            body = json.loads(request.content)
        self.calls.append(Call(request.method, path, body))
        if self.unanswered.get((request.method, path)):
            self.unanswered[(request.method, path)] -= 1
            raise httpx.ReadTimeout("Discord never answered", request=request)
        queued = self.errors.get((request.method, path))
        if queued:
            status, payload = queued.pop(0)
            return httpx.Response(status, json=payload)
        return httpx.Response(200, json=self._ok(request.method, path, body))

    def _ok(self, method: str, path: str, body: dict[str, Any] | None) -> Any:
        if method == "POST" and path == "/users/@me/channels":
            assert body is not None
            return {"id": f"dm-{body['recipient_id']}"}
        if method == "POST" and path.endswith("/messages"):
            self._next_message += 1
            return {"id": f"m{self._next_message}"}
        if method == "GET" and path.startswith("/guilds/") and path.endswith("/roles"):
            return [{"id": GUILD, "permissions": str(self.bot_channel_permissions)}]
        if method == "GET" and "/members/" in path:
            return {"roles": []}
        if method == "GET" and path.startswith("/channels/"):
            return {"id": CHANNEL, "permission_overwrites": []}
        return {}

    # -- assertion helpers -------------------------------------------------

    def find(self, method: str, path: str) -> list[Call]:
        return [c for c in self.calls if c.method == method and c.path == path]

    def channel_posts(self) -> list[Call]:
        return self.find("POST", f"/channels/{CHANNEL}/messages")

    def public_edits(self) -> list[Call]:
        return [c for c in self.calls if c.method == "PATCH" and c.path.startswith(f"/channels/{CHANNEL}/messages/")]

    def original_edits(self) -> list[Call]:
        return self.find("PATCH", f"/webhooks/{APP_ID}/{TOKEN}/messages/@original")

    def dms_to(self, user_id: str) -> list[Call]:
        return self.find("POST", f"/channels/dm-{user_id}/messages")

    def clear(self) -> None:
        self.calls.clear()


# ---------------------------------------------------------------------------
# Signed payloads
# ---------------------------------------------------------------------------


def _member(user_id: str, permissions: int, name: str) -> dict[str, Any]:
    return {"user": {"id": user_id, "username": name.lower()}, "nick": name, "permissions": str(permissions)}


def _payload(kind: int, data: dict[str, Any], user_id: str, permissions: int, name: str) -> dict[str, Any]:
    return {
        "type": kind,
        "id": str(uuid.uuid4().int)[:18],
        "application_id": APP_ID,
        "token": TOKEN,
        "guild_id": GUILD,
        "channel_id": CHANNEL,
        "member": _member(user_id, permissions, name),
        "data": data,
    }


def command(
    name: str,
    sub: str,
    *,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
    display: str = "Thrall",
    resolved: dict[str, Any] | None = None,
    **options: Any,
) -> dict[str, Any]:
    option_list = [{"name": key, "type": 3, "value": value} for key, value in options.items() if value is not None]
    data: dict[str, Any] = {"name": name, "type": 1, "options": [{"type": 1, "name": sub, "options": option_list}]}
    if resolved is not None:
        data["resolved"] = resolved
    return _payload(TYPE_COMMAND, data, user_id, permissions, display)


def menu_command(
    name: str,
    target_id: str,
    *,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
    display: str = "Thrall",
) -> dict[str, Any]:
    """A right-click → Apps command used on the message *target_id*."""
    data = {"name": name, "type": 3, "target_id": target_id, "resolved": {"messages": {target_id: {"id": target_id}}}}
    return _payload(TYPE_COMMAND, data, user_id, permissions, display)


def autocomplete(
    sub: str, focused: str, value: str, *, user_id: str = ORGANISER, name: str = "raid-admin", **filled: Any
) -> dict[str, Any]:
    options = [{"name": key, "type": 3, "value": other} for key, other in filled.items()]
    options.append({"name": focused, "type": 3, "value": value, "focused": True})
    data = {"name": name, "type": 1, "options": [{"type": 1, "name": sub, "options": options}]}
    return _payload(TYPE_AUTOCOMPLETE, data, user_id, ORGANISER_PERMS, "Thrall")


def click(
    custom_id: str,
    *,
    user_id: str,
    permissions: int = 0,
    display: str | None = None,
    values: list[str] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {"custom_id": custom_id, "component_type": 2}
    if values is not None:
        data = {"custom_id": custom_id, "component_type": 3, "values": values}
    return _payload(TYPE_COMPONENT, data, user_id, permissions, display or f"Player{user_id[-3:]}")


def pick_user(
    custom_id: str,
    picked_id: str,
    *,
    picked_name: str,
    bot: bool = False,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
) -> dict[str, Any]:
    """A pick in a user menu: Discord sends the user (and their member) it resolved."""
    resolved = {
        "users": {picked_id: {"id": picked_id, "username": picked_name.lower(), "global_name": None, "bot": bot}},
        "members": {picked_id: {"nick": picked_name, "roles": []}},
    }
    data = {"custom_id": custom_id, "component_type": 5, "values": [picked_id], "resolved": resolved}
    return _payload(TYPE_COMPONENT, data, user_id, permissions, "Thrall")


def modal_submit(
    custom_id: str,
    fields: dict[str, str],
    *,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
    display: str = "Thrall",
) -> dict[str, Any]:
    """A modal's submit: each text input comes back inside its Label."""
    components = [
        {"type": 18, "component": {"type": 4, "custom_id": key, "value": value}} for key, value in fields.items()
    ]
    return _payload(TYPE_MODAL_SUBMIT, {"custom_id": custom_id, "components": components}, user_id, permissions, display)


def signed_headers(body: bytes) -> dict[str, str]:
    ts = str(int(time.time()))
    return {
        "X-Signature-Ed25519": _PRIVATE_KEY.sign(ts.encode() + body).hex(),
        "X-Signature-Timestamp": ts,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Reading responses
# ---------------------------------------------------------------------------


def custom_ids(response: dict[str, Any]) -> list[str]:
    rows = response.get("data", {}).get("components", [])
    return [c["custom_id"] for row in rows for c in row["components"] if "custom_id" in c]


def custom_id_for(response: dict[str, Any], action: str) -> str:
    matches = [cid for cid in custom_ids(response) if cid.startswith(f"raid:v1:{action}:")]
    assert matches, f"no {action} component in {custom_ids(response)}"
    return matches[0]


def content(response: dict[str, Any]) -> str:
    return response["data"]["content"]


def assert_ephemeral(response: dict[str, Any]) -> None:
    assert response["type"] == 4
    assert response["data"]["flags"] & EPHEMERAL
    assert response["data"]["allowed_mentions"] == {"parse": []}


def future_when(days: int = 10) -> str:
    return (datetime.now(NY) + timedelta(days=days)).strftime("%Y-%m-%d") + " 20:00"


# ---------------------------------------------------------------------------
# Common steps
# ---------------------------------------------------------------------------


Post = Callable[[dict[str, Any]], Any]


async def setup_guild(post: Post, *, ping_role: str | None = ROLE) -> dict[str, Any]:
    resolved = None
    if ping_role is not None:
        resolved = {"roles": {ping_role: {"id": ping_role, "mentionable": True}}}
    return await post(
        command("raid-admin", "setup", channel=CHANNEL, timezone="Eastern (US)", ping_role=ping_role, resolved=resolved)
    )


async def create_and_post(post: Post, db: AsyncSession, *, size: int = 5) -> WowRaidEvent:
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=size, notes="Bring FR"))
    response = await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 7
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    await db.refresh(event)
    return event
