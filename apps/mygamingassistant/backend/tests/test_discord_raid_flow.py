"""End-to-end raid-signup flows through POST /discord/interactions.

Every request is a real Ed25519-signed interaction payload; handlers run
against the SAVEPOINT-bound ``db`` fixture (``bound_unit_of_work`` points
every ``unit_of_work`` at it, including the background tasks).  Outbound
Discord REST is a ``httpx.MockTransport`` behind a patched
``app.services.discord.rest.make_rest_client`` — :class:`FakeDiscord`
records each call so tests assert what the bot *sent*, not how.

httpx's ASGITransport awaits the whole ASGI call, so FastAPI background
tasks have finished by the time ``post`` returns.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from httpx import ASGITransport, AsyncClient
from platform_shared.services.discord import (
    EMBED_LINKS,
    MANAGE_EVENTS,
    MANAGE_GUILD,
    SEND_MESSAGES,
    VIEW_CHANNEL,
    DiscordRestClient,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, rest
from app.services.wow.raid_embed import COLOR_FULL
from app.services.wow.raid_roster import order_numbers
from app.services.wow.raid_time_parser import PAST_MESSAGE, UNREADABLE_MESSAGE

pytestmark = pytest.mark.asyncio

_PRIVATE_KEY = Ed25519PrivateKey.generate()
_PUBLIC_KEY_HEX = _PRIVATE_KEY.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()

APP_ID = "900000000000000001"
GUILD = "800000000000000001"
CHANNEL = "700000000000000001"
ROLE = "600000000000000001"
ORGANISER = "500000000000000001"
TOKEN = "tok"

ORGANISER_PERMS = MANAGE_EVENTS | MANAGE_GUILD
NY = ZoneInfo("America/New_York")

_TYPE_COMMAND = 2
_TYPE_COMPONENT = 3
_TYPE_AUTOCOMPLETE = 4
_EPHEMERAL = 64


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


def _base(kind: int, data: dict[str, Any], user_id: str, permissions: int, name: str) -> dict[str, Any]:
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
    return _base(_TYPE_COMMAND, data, user_id, permissions, display)


def autocomplete(
    sub: str, focused: str, value: str, *, user_id: str = ORGANISER, name: str = "raid-admin", **filled: Any
) -> dict[str, Any]:
    options = [{"name": key, "type": 3, "value": other} for key, other in filled.items()]
    options.append({"name": focused, "type": 3, "value": value, "focused": True})
    data = {"name": name, "type": 1, "options": [{"type": 1, "name": sub, "options": options}]}
    return _base(_TYPE_AUTOCOMPLETE, data, user_id, ORGANISER_PERMS, "Thrall")


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
    return _base(_TYPE_COMPONENT, data, user_id, permissions, display or f"Player{user_id[-3:]}")


def _signed(body: bytes) -> dict[str, str]:
    ts = str(int(time.time()))
    return {
        "X-Signature-Ed25519": _PRIVATE_KEY.sign(ts.encode() + body).hex(),
        "X-Signature-Timestamp": ts,
        "Content-Type": "application/json",
    }


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
    assert response["data"]["flags"] & _EPHEMERAL
    assert response["data"]["allowed_mentions"] == {"parse": []}


def future_when(days: int = 10) -> str:
    return (datetime.now(NY) + timedelta(days=days)).strftime("%Y-%m-%d") + " 20:00"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


Post = Callable[[dict[str, Any]], Any]


@pytest.fixture
def fake_discord(monkeypatch: pytest.MonkeyPatch) -> FakeDiscord:
    fake = FakeDiscord()

    async def _no_sleep(_seconds: float) -> None:
        return None

    def _factory() -> DiscordRestClient:
        return DiscordRestClient("test-bot-token", transport=httpx.MockTransport(fake.handler), sleep=_no_sleep)

    monkeypatch.setattr(rest, "make_rest_client", _factory)
    return fake


@pytest_asyncio.fixture
async def http(
    monkeypatch: pytest.MonkeyPatch, bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> AsyncGenerator[AsyncClient, None]:
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_public_key", _PUBLIC_KEY_HEX)
    monkeypatch.setattr(settings, "discord_application_id", APP_ID)
    monkeypatch.setattr(settings, "discord_bot_token", "test-bot-token")

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def post(http: AsyncClient) -> Post:
    async def _post(payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode()
        resp = await http.post("/discord/interactions", content=body, headers=_signed(body))
        assert resp.status_code == 200, resp.text
        return resp.json()

    return _post


async def _setup(post: Post, *, ping_role: str | None = ROLE) -> dict[str, Any]:
    resolved = None
    if ping_role is not None:
        resolved = {"roles": {ping_role: {"id": ping_role, "mentionable": True}}}
    return await post(
        command("raid-admin", "setup", channel=CHANNEL, timezone="Eastern (US)", ping_role=ping_role, resolved=resolved)
    )


async def _create_and_post(post: Post, db: AsyncSession, *, size: int = 5) -> WowRaidEvent:
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=size, notes="Bring FR"))
    response = await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 7
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    await db.refresh(event)
    return event


async def _signups(db: AsyncSession, event: WowRaidEvent) -> dict[str, str]:
    rows = (await db.execute(select(WowRaidSignup).where(WowRaidSignup.event_id == event.id))).scalars().all()
    for row in rows:
        await db.refresh(row)
    return {row.discord_user_id: row.status for row in rows}


async def _save_prefs(post: Post, user_id: str, spec: str = "mage.frost") -> None:
    response = await post(command("raid", "prefs", user_id=user_id, permissions=0, spec=spec))
    assert "Saved." in content(response)


async def _signup_row(db: AsyncSession, event: WowRaidEvent, user_id: str) -> WowRaidSignup:
    row = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id=user_id)
    assert row is not None
    await db.refresh(row)
    return row


async def _pref_row(db: AsyncSession, user_id: str) -> WowRaidMemberPref:
    row = (
        await db.execute(select(WowRaidMemberPref).where(WowRaidMemberPref.discord_user_id == user_id))
    ).scalars().one()
    await db.refresh(row)
    return row


def _signup_id(event: WowRaidEvent) -> str:
    return f"raid:v1:signup:{event.id}"


# ---------------------------------------------------------------------------
# The main organiser + player journey
# ---------------------------------------------------------------------------


async def test_full_raid_journey(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    # --- setup: deferred reply, then the background permission check edits it
    response = await _setup(post)
    assert response == {"type": 5, "data": {"flags": _EPHEMERAL}}
    (setup_edit,) = fake_discord.original_edits()
    assert setup_edit.body is not None
    assert setup_edit.body["content"].startswith(f"All set. Raids will post in <#{CHANNEL}>, pinging <@&{ROLE}>.")
    assert "flags" not in setup_edit.body
    assert fake_discord.find("GET", f"/guilds/{GUILD}/members/{APP_ID}")
    fake_discord.clear()

    # --- create: private preview, nothing posted, no notifications yet
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5, notes="Bring FR"))
    assert_ephemeral(preview)
    assert content(preview).startswith("**Onyxia (5-man)**")
    assert "8:00 PM America/New_York. Does this look right?" in content(preview)
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    assert event.status == "draft"
    assert event.created_by_display_name == "Thrall"
    assert fake_discord.calls == []

    # --- confirm: UPDATE_MESSAGE "Posting…", public post with the role ping, preview edited to a link
    confirm_id = custom_id_for(preview, "confirm")
    response = await post(click(confirm_id, user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 7
    assert content(response) == raid_copy.posting(CHANNEL)
    (public_post,) = fake_discord.channel_posts()
    assert public_post.body is not None
    assert public_post.body["content"] == f"<@&{ROLE}>"
    assert public_post.body["allowed_mentions"] == {"parse": [], "roles": [ROLE]}
    await db.refresh(event)
    assert event.status == "scheduled"
    assert event.message_id == "m1"
    (posted_edit,) = fake_discord.original_edits()
    assert posted_edit.body is not None
    link = rest.message_link(GUILD, CHANNEL, "m1")
    assert posted_edit.body["content"] == raid_copy.posted(CHANNEL, link)
    notifications = (
        await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event.id))
    ).scalars().all()
    assert notifications, "posting must schedule the raid's notifications"
    original_due = sorted(n.due_at for n in notifications)
    fake_discord.clear()

    # --- confirm again (double click): idempotent, no second post
    response = await post(click(confirm_id, user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.already_posted(link)
    assert fake_discord.channel_posts() == []

    # --- first-time signup: class select → that class's spec select → saved
    response = await post(click(_signup_id(event), user_id="101"))
    assert_ephemeral(response)
    class_select = response["data"]["components"][0]["components"][0]
    assert class_select["type"] == 3
    response = await post(click(class_select["custom_id"], user_id="101", values=["druid"]))
    assert response["type"] == 7
    assert content(response) == raid_copy.spec_prompt("Druid")
    assert custom_ids(response) == [
        f"raid:v1:spec:{event.id}:druid:confirmed",
        f"raid:v1:pickclass:{event.id}:confirmed",
    ]
    spec_options = response["data"]["components"][0]["components"][0]["options"]
    assert [o["value"] for o in spec_options] == [
        "druid.balance",
        "druid.feral-damage",
        "druid.feral-tank",
        "druid.restoration",
    ]
    assert not any(o.get("default") for o in spec_options)  # never guess a preselection
    fake_discord.clear()
    response = await post(click(f"raid:v1:spec:{event.id}:druid:confirmed", user_id="101", values=["druid.restoration"]))
    assert response["type"] == 7
    assert content(response) == f"{raid_copy.signed_up_as('Restoration Druid')} {raid_copy.NEXT_TIME_ONE_TAP}"
    (refresh,) = fake_discord.public_edits()
    assert refresh.path == f"/channels/{CHANNEL}/messages/m1"
    assert refresh.body is not None and "content" not in refresh.body  # never re-pings
    assert refresh.body["allowed_mentions"] == {"parse": []}
    assert (await _signups(db, event)) == {"101": "confirmed"}

    # --- one tap with saved prefs: Tentative updates the public message in place
    response = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="101"))
    assert response["type"] == 7
    assert "embeds" in response["data"]
    assert (await _signups(db, event))["101"] == "tentative"

    # --- same status again: private no-op
    response = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="101"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.already_in_status("tentative")

    # --- fill the raid (5 seats), then a sixth player joins the queue
    for user_id in ("101", "102", "103", "104", "105"):
        if user_id != "101":
            await _save_prefs(post, user_id)
        response = await post(click(_signup_id(event), user_id=user_id))
        assert response["type"] == 7
    await _save_prefs(post, "106", "warrior.protection")
    fake_discord.clear()
    response = await post(click(_signup_id(event), user_id="106"))
    assert response["type"] == 7
    full_embed = response["data"]["embeds"][0]
    assert full_embed["color"] == COLOR_FULL
    assert [f["name"] for f in full_embed["fields"]][-1] == "Queued (1) · waiting for a seat"
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None
    assert followup.body["content"] == raid_copy.queued_note(1)
    assert followup.body["flags"] == _EPHEMERAL
    await _save_prefs(post, "107", "rogue.combat")
    await post(click(_signup_id(event), user_id="107"))
    statuses = await _signups(db, event)
    assert statuses["106"] == "queued" and statuses["107"] == "queued"

    # --- a DPS seat holder marks absence while players queue: asked first, since
    #     the seat goes to the queue at once
    fake_discord.clear()
    response = await post(click(f"raid:v1:status:{event.id}:absence", user_id="102"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.release_prompt("absence")
    assert custom_ids(response) == [f"raid:v1:release:{event.id}:absence", f"raid:v1:stay:{event.id}"]
    assert (await _signups(db, event))["102"] == "confirmed"
    assert fake_discord.public_edits() == []

    # --- [Yes, free my seat] → the first queued DPS moves up (ahead of the tank at
    #     the front of the line, so the raid keeps its shape) and is DM'd
    response = await post(click(custom_id_for(response, "release"), user_id="102"))
    assert response["type"] == 7
    assert content(response) == raid_copy.seat_released("absence", handed_on=True)
    assert custom_ids(response) == []
    assert len(fake_discord.public_edits()) == 1
    statuses = await _signups(db, event)
    assert statuses["102"] == "absence"
    assert statuses["107"] == "confirmed"
    assert statuses["106"] == "queued"
    (promotion_dm,) = fake_discord.dms_to("107")
    assert promotion_dm.body is not None
    assert promotion_dm.body["content"].startswith("Good news: a seat opened up in **Onyxia**")
    assert promotion_dm.body["allowed_mentions"] == {"parse": []}
    assert fake_discord.dms_to("106") == []

    # --- My signup shows the queue position
    response = await post(click(f"raid:v1:mine:{event.id}", user_id="106"))
    assert_ephemeral(response)
    assert content(response) == (
        f"For **Onyxia** you're **#1 in the queue** as Protection Warrior.\n{raid_copy.QUEUE_MOVES_UP}"
    )
    assert custom_ids(response) == [f"raid:v1:change:{event.id}"]

    # --- Roster lists everyone privately
    response = await post(click(f"raid:v1:roster:{event.id}", user_id="106"))
    assert_ephemeral(response)

    # --- edit size: a bigger raid moves the queue up; shrinking below seats is refused
    fake_discord.clear()
    response = await post(command("raid-admin", "edit", event=str(event.id), size=6))
    assert content(response) == raid_copy.EDIT_DONE
    assert (await _signups(db, event))["106"] == "confirmed"
    assert len(fake_discord.dms_to("106")) == 1
    assert len(fake_discord.public_edits()) == 1
    response = await post(command("raid-admin", "edit", event=str(event.id), size=5))
    assert content(response) == raid_copy.size_too_small(6)
    await db.refresh(event)
    assert event.size_cap == 6

    # --- edit time: notifications are rescheduled around the new start
    new_when = future_when(days=12)
    response = await post(command("raid-admin", "edit", event=str(event.id), when=new_when))
    assert content(response) == raid_copy.EDIT_DONE
    await db.refresh(event)
    rescheduled = (
        await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event.id))
    ).scalars().all()
    assert rescheduled
    assert sorted(n.due_at for n in rescheduled) != original_due
    assert all(n.due_at <= event.starts_at for n in rescheduled)

    # --- cancel: confirm prompt, then cancelled embed + channel message + DMs
    response = await post(command("raid-admin", "cancel", event=str(event.id), reason="Server maintenance"))
    assert_ephemeral(response)
    fake_discord.clear()
    response = await post(click(custom_id_for(response, "cancel"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 7
    assert content(response) == raid_copy.cancelled_done(CHANNEL)
    await db.refresh(event)
    assert event.status == "cancelled"
    remaining = (
        await db.execute(
            select(WowRaidNotification).where(
                WowRaidNotification.event_id == event.id, WowRaidNotification.sent_at.is_(None)
            )
        )
    ).scalars().all()
    assert remaining == []
    (cancel_edit,) = fake_discord.public_edits()
    assert cancel_edit.body is not None
    assert cancel_edit.body["embeds"][0]["title"].startswith("CANCELLED — ")
    (announcement,) = fake_discord.channel_posts()
    assert announcement.body is not None
    assert announcement.body["content"].endswith("has been cancelled: Server maintenance")
    assert announcement.body["allowed_mentions"] == {"parse": []}
    for user_id in ("101", "103", "104", "105", "106", "107"):
        assert len(fake_discord.dms_to(user_id)) == 1, user_id
    assert fake_discord.dms_to("102") == []  # absent players aren't told

    # --- every button on the cancelled raid refuses
    response = await post(click(_signup_id(event), user_id="108"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_FOUND


# ---------------------------------------------------------------------------
# Focused cases
# ---------------------------------------------------------------------------


async def test_started_raid_refuses_signups(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()
    await _save_prefs(post, "201")
    response = await post(click(_signup_id(event), user_id="201"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.RAID_STARTED
    response = await post(click(f"raid:v1:role:{event.id}:confirmed:druid:tank", user_id="202"))
    assert content(response) == raid_copy.RAID_STARTED
    response = await post(click(f"raid:v1:spec:{event.id}:druid:confirmed", user_id="202", values=["druid.balance"]))
    assert content(response) == raid_copy.RAID_STARTED
    response = await post(click(f"raid:v1:pickclass:{event.id}:confirmed", user_id="202"))
    assert content(response) == raid_copy.RAID_STARTED
    response = await post(click(f"raid:v1:release:{event.id}:absence", user_id="202"))
    assert content(response) == raid_copy.RAID_STARTED
    response = await post(click(f"raid:v1:stay:{event.id}", user_id="202"))
    assert content(response) == raid_copy.RAID_STARTED
    assert (await _signups(db, event)) == {}


async def test_first_late_signup_asks_class_then_spec(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    response = await post(click(f"raid:v1:status:{event.id}:late", user_id="301"))
    select_id = response["data"]["components"][0]["components"][0]["custom_id"]
    assert select_id == f"raid:v1:class:{event.id}:late"
    response = await post(click(select_id, user_id="301", values=["mage"]))
    spec_id = custom_id_for(response, "spec")
    assert spec_id == f"raid:v1:spec:{event.id}:mage:late"
    response = await post(click(spec_id, user_id="301", values=["mage.frost"]))
    assert content(response) == f"{raid_copy.marked_as('late', 'Frost Mage')} {raid_copy.NEXT_TIME_ONE_TAP}"
    assert (await _signups(db, event)) == {"301": "late"}


async def test_change_spec_then_switch_to_a_saved_class(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    await _save_prefs(post, "311", "Holy Priest")
    await _save_prefs(post, "311", "warrior.fury")
    response = await post(click(_signup_id(event), user_id="311"))
    assert response["type"] == 7  # one tap as the remembered Fury Warrior

    # Change class or spec: your class's specs with yours preselected.
    response = await post(click(f"raid:v1:change:{event.id}", user_id="311"))
    assert response["type"] == 7
    assert content(response) == raid_copy.spec_switch_prompt("Fury Warrior")
    options = response["data"]["components"][0]["components"][0]["options"]
    assert [o["value"] for o in options if o.get("default")] == ["warrior.fury"]
    response = await post(click(custom_id_for(response, "spec"), user_id="311", values=["warrior.arms"]))
    assert content(response) == raid_copy.switched_to("Arms Warrior")

    # [Different class] → a class with a saved spec switches without asking.
    response = await post(click(f"raid:v1:change:{event.id}", user_id="311"))
    response = await post(click(custom_id_for(response, "pickclass"), user_id="311"))
    response = await post(click(custom_id_for(response, "class"), user_id="311", values=["priest"]))
    assert content(response) == raid_copy.switched_to("Holy Priest")

    row = await _signup_row(db, event, "311")
    assert (row.status, row.wow_class, row.role, row.spec) == ("confirmed", "priest", "healer", "holy")
    pref = await _pref_row(db, "311")
    assert pref.default_wow_class == "priest"
    assert pref.saved_specs == {"priest": "holy", "warrior": "arms"}


async def test_pre_spec_signup_is_asked_for_its_spec_once(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="321", display_name="Old", status="confirmed",
        wow_class="warrior", role="tank",
    )
    response = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="321"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.spec_prompt("Warrior")
    spec_id = custom_id_for(response, "spec")
    assert spec_id == f"raid:v1:spec:{event.id}:warrior:tentative"
    response = await post(click(spec_id, user_id="321", values=["mage.frost"]))  # not this select's class
    assert content(response) == raid_copy.MENU_TIMEOUT
    response = await post(click(spec_id, user_id="321", values=["warrior.protection"]))
    assert content(response) == f"{raid_copy.marked_as('tentative', 'Protection Warrior')} {raid_copy.NEXT_TIME_ONE_TAP}"
    row = await _signup_row(db, event, "321")
    assert (row.status, row.spec) == ("tentative", "protection")

    # A role button from a picker opened before the update asks for the spec instead.
    response = await post(click(f"raid:v1:role:{event.id}:confirmed:druid:tank", user_id="322"))
    assert response["type"] == 7
    assert custom_id_for(response, "spec") == f"raid:v1:spec:{event.id}:druid:confirmed"


async def test_absence_without_class_needs_no_picker(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    response = await post(click(f"raid:v1:status:{event.id}:absence", user_id="302"))
    assert response["type"] == 7
    assert (await _signups(db, event)) == {"302": "absence"}
    # A [Decline] button on a post from before the rename marks absence too.
    response = await post(click(f"raid:v1:status:{event.id}:declined", user_id="303"))
    assert response["type"] == 7
    assert (await _signups(db, event)) == {"302": "absence", "303": "absence"}


async def test_bench_is_a_backup_that_is_never_moved_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    await _save_prefs(post, "900")
    fake_discord.clear()
    response = await post(click(f"raid:v1:status:{event.id}:bench", user_id="900"))
    assert response["type"] == 7
    assert [f["name"] for f in response["data"]["embeds"][0]["fields"]][-1] == "Bench (1) · backups"
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None and followup.body["content"] == raid_copy.BENCH_NOTE

    for user_id in ("901", "902", "903", "904", "905"):
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    # A seat opens: the backup stays on the bench and isn't DM'd.
    fake_discord.clear()
    await post(click(f"raid:v1:status:{event.id}:absence", user_id="901"))
    assert (await _signups(db, event))["900"] == "bench"
    assert fake_discord.dms_to("900") == []
    response = await post(click(f"raid:v1:mine:{event.id}", user_id="900"))
    assert content(response) == f"For **Onyxia** you're **on the bench** as Frost Mage.\n{raid_copy.BENCH_NOTE}"

    # Asking for a seat takes the open one, at the back of the line.
    response = await post(click(_signup_id(event), user_id="900"))
    assert response["type"] == 7
    rows = [await _signup_row(db, event, user_id) for user_id in ("900", "902", "903", "904", "905")]
    assert rows[0].status == "confirmed"
    assert order_numbers(rows)["900"] == 5


@pytest.mark.parametrize(
    "custom_id",
    [
        "raid:v1:explode",
        "raid:v1:signup:not-a-uuid",
        "raid:v1:status:" + str(uuid.uuid4()) + ":queued",
        "raid:v1:signup:" + "a" * 150,
    ],
)
async def test_malformed_custom_id_gets_generic_error(post: Post, fake_discord: FakeDiscord, custom_id: str) -> None:
    await _setup(post)
    response = await post(click(custom_id, user_id="401"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.GENERIC_ERROR


async def test_non_dict_component_data_is_handled(post: Post, fake_discord: FakeDiscord) -> None:
    payload = click("raid:v1:testdm", user_id="401")
    payload["data"] = ["not", "a", "dict"]
    response = await post(payload)
    assert response["type"] == 4
    assert response["data"]["flags"] & _EPHEMERAL


async def test_unknown_event_and_other_guild_event_not_found(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    response = await post(click(f"raid:v1:signup:{uuid.uuid4()}", user_id="402"))
    assert content(response) == raid_copy.NOT_FOUND


async def test_not_configured(post: Post, fake_discord: FakeDiscord) -> None:
    response = await post(command("raid-admin", "create", raid="onyxia", when=future_when()))
    assert content(response) == raid_copy.NOT_CONFIGURED
    response = await post(command("raid", "list", permissions=0))
    assert content(response) == raid_copy.NOT_CONFIGURED


async def test_admin_commands_recheck_permissions(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    response = await _setup(post)
    assert response["type"] == 5
    response = await post(command("raid-admin", "setup", permissions=MANAGE_EVENTS, channel=CHANNEL, timezone="UTC"))
    assert content(response) == raid_copy.NOT_PERMITTED_GUILD
    response = await post(command("raid-admin", "create", permissions=0, raid="onyxia", when=future_when()))
    assert content(response) == raid_copy.NOT_PERMITTED_EVENTS

    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when()))
    confirm_id = custom_id_for(preview, "confirm")
    response = await post(click(confirm_id, user_id="403", permissions=0))
    assert content(response) == raid_copy.NOT_PERMITTED_EVENTS
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    assert event.status == "draft"
    assert fake_discord.channel_posts() == []


async def test_bad_time_and_bad_size(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    response = await post(command("raid-admin", "create", raid="onyxia", when="whenever"))
    assert_ephemeral(response)
    assert content(response) == UNREADABLE_MESSAGE
    response = await post(command("raid-admin", "create", raid="onyxia", when="1/1/2020 8pm"))
    assert content(response) == PAST_MESSAGE
    response = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=2))
    assert content(response).startswith("Raid size must be between 5 and 40")
    assert (await db.execute(select(WowRaidEvent))).scalars().all() == []


async def test_discard_draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    preview = await post(command("raid-admin", "create", raid="zg", when=future_when()))
    response = await post(click(custom_id_for(preview, "discard"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.DRAFT_DISCARDED
    assert (await db.execute(select(WowRaidEvent))).scalars().all() == []
    assert fake_discord.channel_posts() == []


async def test_post_refused_reverts_to_draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    fake_discord.fail("POST", f"/channels/{CHANNEL}/messages", 403, 50013)
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when()))
    response = await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.posting(CHANNEL)
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    await db.refresh(event)
    assert event.status == "draft"
    assert event.message_id is None
    edit = fake_discord.original_edits()[-1]
    assert edit.body is not None
    assert raid_copy.post_refused(CHANNEL, 50013) in edit.body["content"]
    assert any(cid.startswith("raid:v1:confirm:") for row in edit.body["components"] for cid in [c["custom_id"] for c in row["components"]])
    notifications = (
        await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event.id))
    ).scalars().all()
    assert notifications == []

    # Retry after fixing permissions succeeds.
    response = await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.posting(CHANNEL)
    await db.refresh(event)
    assert event.status == "scheduled" and event.message_id is not None


async def test_unanswered_post_reverts_to_draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    fake_discord.time_out("POST", f"/channels/{CHANNEL}/messages")
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when()))
    await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    await db.refresh(event)
    assert event.status == "draft"
    assert event.message_id is None
    edit = fake_discord.original_edits()[-1]
    assert edit.body is not None
    assert raid_copy.post_refused(CHANNEL, None) in edit.body["content"]


async def test_deleted_public_post_is_reposted(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    assert event.message_id == "m1"
    fake_discord.fail("PATCH", f"/channels/{CHANNEL}/messages/m1", 404, 10008)
    fake_discord.clear()
    response = await post(command("raid-admin", "edit", event=str(event.id), notes="New notes"))
    assert content(response) == raid_copy.EDIT_DONE
    (repost,) = fake_discord.channel_posts()
    assert repost.body is not None
    assert "content" not in repost.body  # a repost never pings the role again
    await db.refresh(event)
    assert event.message_id == "m2"


async def test_setup_reports_missing_bot_permissions(post: Post, fake_discord: FakeDiscord) -> None:
    fake_discord.bot_channel_permissions = VIEW_CHANNEL
    await _setup(post, ping_role=None)
    (edit,) = fake_discord.original_edits()
    assert edit.body is not None
    assert edit.body["content"].startswith(f"Saved, but I can't post in <#{CHANNEL}> yet.")
    assert "Send Messages" in edit.body["content"] and "Embed Links" in edit.body["content"]


async def test_setup_check_reports_when_discord_does_not_answer(post: Post, fake_discord: FakeDiscord) -> None:
    fake_discord.time_out("GET", f"/channels/{CHANNEL}")
    response = await _setup(post, ping_role=None)
    assert response == {"type": 5, "data": {"flags": _EPHEMERAL}}
    (edit,) = fake_discord.original_edits()
    assert edit.body is not None
    assert edit.body["content"].endswith(raid_copy.SETUP_CHECK_FAILED)


async def test_unanswered_reply_edit_is_one_warning(
    post: Post, fake_discord: FakeDiscord, caplog: pytest.LogCaptureFixture
) -> None:
    fake_discord.time_out("PATCH", f"/webhooks/{APP_ID}/{TOKEN}/messages/@original")
    with caplog.at_level(logging.WARNING, logger="app.services.discord.raid_publisher"):
        await _setup(post, ping_role=None)
    records = [r for r in caplog.records if r.name == "app.services.discord.raid_publisher"]
    assert [(r.levelno, r.getMessage()) for r in records] == [
        (logging.WARNING, "Raid bot: could not edit the original interaction response (ReadTimeout)")
    ]


async def test_setup_rejects_unknown_timezone(post: Post, fake_discord: FakeDiscord) -> None:
    response = await post(command("raid-admin", "setup", channel=CHANNEL, timezone="Mars/Olympus"))
    assert content(response) == raid_copy.unknown_timezone("Mars/Olympus")
    assert fake_discord.calls == []


async def test_autocomplete(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    response = await post(autocomplete("setup", "timezone", "chicago"))
    assert response["type"] == 8
    assert response["data"]["choices"][0]["value"] == "America/Chicago"

    await _setup(post)
    event = await _create_and_post(post, db)
    response = await post(autocomplete("edit", "event", "onyx"))
    assert response["type"] == 8
    assert [c["value"] for c in response["data"]["choices"]] == [str(event.id)]
    response = await post(autocomplete("cancel", "event", "naxx"))
    assert response["data"]["choices"] == []

    # /raid prefs spec: — the filled-in class narrows the list.
    response = await post(autocomplete("prefs", "spec", "ho", name="raid", **{"class": "priest"}))
    assert response["data"]["choices"] == [{"name": "Holy", "value": "priest.holy"}]
    response = await post(autocomplete("prefs", "spec", "holy", name="raid"))
    assert [c["name"] for c in response["data"]["choices"]] == ["Holy Paladin", "Holy Priest"]
    response = await post(autocomplete("prefs", "spec", "feral tank", name="raid"))
    assert response["data"]["choices"] == [{"name": "Feral Druid (tank)", "value": "druid.feral-tank"}]


async def test_list_shows_upcoming_raids(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    response = await post(command("raid", "list", permissions=0))
    assert content(response) == raid_copy.NO_UPCOMING
    await _create_and_post(post, db)
    response = await post(command("raid", "list", permissions=0))
    assert_ephemeral(response)
    assert "Onyxia" in json.dumps(response["data"])


async def test_prefs_and_test_dm(post: Post, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    fake_discord.clear()
    response = await post(command("raid", "prefs", user_id="501", permissions=0))
    assert_ephemeral(response)
    response = await post(command("raid", "prefs", user_id="501", permissions=0, spec="holy"))
    assert content(response) == "Did you mean Holy Paladin or Holy Priest? Add `class:` too, or pick from the list."
    response = await post(command("raid", "prefs", user_id="501", permissions=0, **{"class": "mage", "spec": "holy"}))
    assert_ephemeral(response)
    assert content(response) == "A Mage can be Arcane, Fire or Frost."
    response = await post(command("raid", "prefs", user_id="501", permissions=0, spec="Holy Priest"))
    assert "Signing up as: **Holy Priest**" in content(response)

    test_dm_id = "raid:v1:testdm"
    assert test_dm_id in custom_ids(await post(command("raid", "prefs", user_id="501", permissions=0)))
    response = await post(click(test_dm_id, user_id="501"))
    assert response == {"type": 5, "data": {"flags": _EPHEMERAL}}
    (dm,) = fake_discord.dms_to("501")
    assert dm.body is not None and dm.body["content"] == raid_copy.TEST_DM_BODY
    assert fake_discord.original_edits()[-1].body["content"] == raid_copy.TEST_DM_SENT

    fake_discord.fail("POST", "/channels/dm-502/messages", 403, 50007)
    await post(click(test_dm_id, user_id="502"))
    assert fake_discord.original_edits()[-1].body["content"] == raid_copy.TEST_DM_BLOCKED

    fake_discord.time_out("POST", "/channels/dm-503/messages")
    await post(click(test_dm_id, user_id="503"))
    assert fake_discord.original_edits()[-1].body["content"] == raid_copy.TEST_DM_FAILED


async def test_cancellation_dms_continue_past_an_unanswered_one(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    for user_id in ("801", "802"):
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    prompt = await post(command("raid-admin", "cancel", event=str(event.id)))
    fake_discord.clear()
    fake_discord.time_out("POST", "/users/@me/channels")  # whoever is DMed first
    await post(click(custom_id_for(prompt, "cancel"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    opened = sorted(c.body["recipient_id"] for c in fake_discord.find("POST", "/users/@me/channels") if c.body)
    assert opened == ["801", "802"]
    assert len(fake_discord.dms_to("801")) + len(fake_discord.dms_to("802")) == 1


async def test_dm_opt_out_skips_promotion_dm(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    for user_id in ("601", "602", "603", "604", "605"):
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    response = await post(
        command("raid", "prefs", user_id="606", permissions=0, spec="mage.frost", dm_reminders=False)
    )
    assert "Saved." in content(response)
    await post(click(_signup_id(event), user_id="606"))
    assert (await _signups(db, event))["606"] == "queued"
    fake_discord.clear()
    await post(click(f"raid:v1:status:{event.id}:tentative", user_id="601"))  # asks first
    await post(click(f"raid:v1:release:{event.id}:tentative", user_id="601"))
    assert (await _signups(db, event))["606"] == "confirmed"
    assert fake_discord.dms_to("606") == []


async def test_keeping_the_seat_changes_nothing(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    players = ("1010", "1011", "1012", "1013", "1001", "1003")  # five seats, then 1003 is queued
    for user_id in players:
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    before = dict.fromkeys(players, "confirmed") | {"1003": "queued"}
    assert (await _signups(db, event)) == before

    response = await post(click(f"raid:v1:status:{event.id}:bench", user_id="1001"))
    assert content(response) == raid_copy.release_prompt("bench")
    fake_discord.clear()
    response = await post(click(custom_id_for(response, "stay"), user_id="1001"))
    assert response["type"] == 7
    assert content(response) == raid_copy.SEAT_KEPT
    assert custom_ids(response) == []
    assert (await _signups(db, event)) == before
    assert fake_discord.public_edits() == [] and fake_discord.dms_to("1003") == []

    # Same status again points at what they probably wanted.
    response = await post(click(_signup_id(event), user_id="1001"))
    assert content(response) == raid_copy.already_in_status("confirmed", spec_label="Frost Mage")
    # Late holds a seat too, so the queue can't skip ahead that way.
    response = await post(click(f"raid:v1:status:{event.id}:late", user_id="1003"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.late_while_queued(1)
    # A stale card from someone who has since left.
    response = await post(click(f"raid:v1:release:{event.id}:absence", user_id="1004"))
    assert content(response) == raid_copy.NOT_SIGNED_UP


async def test_an_old_seat_card_changes_nothing_once_the_seat_is_gone(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    for user_id in ("1110", "1111", "1112", "1113", "1101", "1103"):  # five seats, then 1103 is queued
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    bench_card = await post(click(f"raid:v1:status:{event.id}:bench", user_id="1101"))
    absence_card = await post(click(f"raid:v1:status:{event.id}:absence", user_id="1101"))
    release_absence = custom_id_for(absence_card, "release")
    await post(click(release_absence, user_id="1101"))
    assert (await _signups(db, event))["1101"] == "absence"

    # Tapped twice: still absent, and it says so.
    response = await post(click(release_absence, user_id="1101"))
    assert content(response) == raid_copy.already_in_status("absence")
    # The bench card from before has no seat left to free or keep.
    fake_discord.clear()
    for action in ("release", "stay"):
        response = await post(click(custom_id_for(bench_card, action), user_id="1101"))
        assert response["type"] == 7
        assert content(response) == raid_copy.NO_SEAT_TO_FREE
    assert (await _signups(db, event))["1101"] == "absence"
    assert fake_discord.public_edits() == []


async def test_an_old_change_menu_keeps_the_status_you_have_now(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    await _save_prefs(post, "1201")
    await post(click(f"raid:v1:status:{event.id}:bench", user_id="1201"))
    menu = await post(click(f"raid:v1:change:{event.id}", user_id="1201"))
    spec_id = custom_id_for(menu, "spec")
    assert spec_id == f"raid:v1:spec:{event.id}:mage:same"

    # They take a seat from the post while the menu sits open...
    await post(click(_signup_id(event), user_id="1201"))
    # ...so picking from it switches the spec and keeps the seat.
    response = await post(click(spec_id, user_id="1201", values=["mage.fire"]))
    assert content(response) == raid_copy.switched_to("Fire Mage")
    row = await _signup_row(db, event, "1201")
    assert (row.status, row.spec) == ("confirmed", "fire")


async def test_a_spec_picked_after_a_queue_formed_asks_before_freeing_the_seat(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    # A seat from before the bot asked for classes.
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="1301", display_name="Old", status="confirmed"
    )
    menu = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="1301"))
    class_id = custom_id_for(menu, "class")
    # The raid fills and a queue forms while the menu sits open.
    for user_id in ("1302", "1303", "1304", "1305", "1306"):
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    assert (await _signups(db, event))["1306"] == "queued"

    response = await post(click(class_id, user_id="1301", values=["mage"]))
    response = await post(click(custom_id_for(response, "spec"), user_id="1301", values=["mage.frost"]))
    assert response["type"] == 7
    assert content(response) == raid_copy.release_prompt("tentative")
    assert custom_ids(response) == [f"raid:v1:release:{event.id}:tentative", f"raid:v1:stay:{event.id}"]
    row = await _signup_row(db, event, "1301")
    assert (row.status, row.spec) == ("confirmed", "frost")  # the spec is saved, the seat kept
    assert (await _signups(db, event))["1306"] == "queued"

    response = await post(click(custom_id_for(response, "release"), user_id="1301"))
    assert content(response) == raid_copy.seat_released("tentative", handed_on=True)
    assert (await _signups(db, event))["1306"] == "confirmed"


async def test_leaving_the_queue_needs_no_card_but_says_so(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    for user_id in ("1401", "1402", "1403", "1404", "1405", "1406"):  # 1406 is queued
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    fake_discord.clear()
    response = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="1406"))
    assert response["type"] == 7  # a place in the queue isn't a seat, so no card
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None and followup.body["content"] == raid_copy.LEFT_QUEUE
    assert (await _signups(db, event))["1406"] == "tentative"


async def test_keep_raid_leaves_it_scheduled(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    prompt = await post(command("raid-admin", "cancel", event=str(event.id), reason="maybe"))
    response = await post(click(custom_id_for(prompt, "keep"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.CANCEL_KEPT
    await db.refresh(event)
    assert event.status == "scheduled"
    assert event.cancel_reason is None
    response = await post(click(custom_id_for(prompt, "cancel"), user_id="607", permissions=0))
    assert content(response) == raid_copy.NOT_PERMITTED_EVENTS


async def test_queued_player_changing_class_keeps_queue_position(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await _setup(post)
    event = await _create_and_post(post, db)
    for user_id in ("701", "702", "703", "704", "705", "706", "707"):
        await _save_prefs(post, user_id)
        await post(click(_signup_id(event), user_id=user_id))
    statuses = await _signups(db, event)
    assert statuses["706"] == "queued" and statuses["707"] == "queued"

    response = await post(click(f"raid:v1:change:{event.id}", user_id="706"))
    assert response["type"] == 7
    response = await post(click(custom_id_for(response, "pickclass"), user_id="706"))
    response = await post(click(custom_id_for(response, "class"), user_id="706", values=["warlock"]))
    response = await post(click(custom_id_for(response, "spec"), user_id="706", values=["warlock.affliction"]))
    assert raid_copy.queued_note(1) in content(response)

    await post(click(f"raid:v1:status:{event.id}:absence", user_id="701"))  # asks first
    await post(click(f"raid:v1:release:{event.id}:absence", user_id="701"))
    statuses = await _signups(db, event)
    assert statuses["706"] == "confirmed"  # still first in line despite the later edit
    assert statuses["707"] == "queued"
