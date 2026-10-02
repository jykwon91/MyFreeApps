"""End-to-end flows for Raid: Unsigned — who hasn't signed up, and [Ping them] — and /raid-admin raiders.

Through POST /discord/interactions with the harness in ``discord_raid_harness.py``.
Discord's member list comes from :class:`_Server`, a ``FakeDiscord`` that pages
``GET /guilds/{guild}/members`` by ``limit``/``after`` and lists the server's
roles.  Sign-ups are written straight to the repository: the sign-up buttons
have their own flows.
"""
from __future__ import annotations

import importlib.util
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest
from platform_shared.services.discord import MANAGE_EVENTS, DiscordRestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_member_list, raid_unsigned_copy, rest
from app.services.discord.commands_spec import SIGNED_MENU, UNSIGNED_MENU
from app.services.discord.raid_unsigned_views import raiders_data
from app.services.wow.raid_embed import column_heading
from app.services.wow.raid_post_layout import NO_CLASS_COLUMN
from app.services.wow.raid_unsigned import MAX_PING

from discord_raid_harness import (
    CHANNEL,
    EPHEMERAL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    ROLE,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    create_and_post,
    custom_ids,
    menu_command,
    modal_submit,
    pick_roles,
    setup_guild,
)

_MEMBERS = f"/guilds/{GUILD}/members"
_RAIDER = "600000000000000002"
_TRIAL = "600000000000000003"
_RAIDERS_MENU = "raid:v1:rr"
_MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0040_wow_raid_unsigned.py"
# A class's role and spec, as the sign-up buttons save them.
_SEATS: dict[str | None, tuple[str | None, str | None]] = {
    None: (None, None),
    "warrior": ("tank", "protection"),
    "priest": ("healer", "holy"),
    "mage": ("dps", "frost"),
}


@dataclass
class _Server(FakeDiscord):
    """Discord with a member list (``people``, a page per ``limit``/``after``) and the server's ``role_ids``."""

    people: list[dict[str, Any]] = field(default_factory=list)
    role_ids: list[str] = field(default_factory=lambda: [ROLE, _RAIDER, _TRIAL])
    pages: list[dict[str, str]] = field(default_factory=list)  # each member-list call's query

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.removeprefix("/api/v10") == _MEMBERS:
            self.pages.append(dict(request.url.params))
        return super().handler(request)

    def _ok(self, method: str, path: str, body: dict[str, Any] | None) -> Any:
        if method == "GET" and path == _MEMBERS:
            after, limit = int(self.pages[-1]["after"]), int(self.pages[-1]["limit"])
            ordered = sorted(self.people, key=lambda person: int(person["user"]["id"]))
            return [person for person in ordered if int(person["user"]["id"]) > after][:limit]
        if method == "GET" and path == f"/guilds/{GUILD}/roles":
            everyone = {"id": GUILD, "permissions": str(self.bot_channel_permissions)}
            return [everyone, *({"id": role_id, "permissions": "0"} for role_id in self.role_ids)]
        return super()._ok(method, path, body)

    def clear(self) -> None:
        super().clear()
        self.pages.clear()


@pytest.fixture
def fake_discord(monkeypatch: pytest.MonkeyPatch) -> _Server:
    """conftest's ``fake_discord``, with members to list."""
    fake = _Server()

    async def _no_sleep(_seconds: float) -> None:
        return None

    def _factory() -> DiscordRestClient:
        return DiscordRestClient("test-bot-token", transport=httpx.MockTransport(fake.handler), sleep=_no_sleep)

    monkeypatch.setattr(rest, "make_rest_client", _factory)
    return fake


def _id(n: int) -> str:
    return str(400_000_000_000_000_000 + n)


def _person(n: int, name: str, *roles: str, bot: bool = False, pending: bool = False) -> dict[str, Any]:
    """A server member, as List Guild Members returns one."""
    user = {"id": _id(n), "username": name.lower(), "global_name": None, "bot": bot}
    return {"user": user, "nick": name, "roles": list(roles), "pending": pending}


async def _raid(post: Post, db: AsyncSession, fake: _Server, *, ping_role: str | None = ROLE) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post, ping_role=ping_role)
    event = await create_and_post(post, db)
    fake.clear()
    return event


async def _old_raid(db: AsyncSession, guild_id: uuid.UUID, *, days: int) -> WowRaidEvent:
    """A raid that's done, *days* ago."""
    return await wow_raid_event_repo.create(
        db,
        guild_id=guild_id,
        raid_key="onyxia",
        starts_at=datetime.now(timezone.utc) - timedelta(days=days),
        size_cap=40,
        channel_id=CHANNEL,
        created_by_user_id=ORGANISER,
        status="completed",
    )


async def _sign_up(
    db: AsyncSession, event_id: uuid.UUID, n: int, status: str = "confirmed", wow_class: str | None = "mage"
) -> WowRaidSignup:
    role, spec = _SEATS[wow_class]
    return await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event_id,
        discord_user_id=_id(n),
        display_name=f"Player{n}",
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
    )


def _lead(custom_id: str) -> dict[str, Any]:
    """A click on one of the leader's cards, by the organiser."""
    return click(custom_id, user_id=ORGANISER, permissions=ORGANISER_PERMS)


def _raid_line(event: WowRaidEvent) -> str:
    return f"**Onyxia's Lair** · <t:{int(event.starts_at.timestamp())}:F>"


def _heading(column: str, count: int) -> str:
    return f"**{column_heading(column, count, emojis.current())}**"


def _checking(text: str) -> dict[str, Any]:
    """'Checking…' in place of the card, with no buttons to press twice."""
    return {"type": 7, "data": {"content": text, "allowed_mentions": {"parse": []}, "components": [], "embeds": []}}


def _shown(data: dict[str, Any]) -> dict[str, Any]:
    """A card as an edit carries it (an edit can't change flags)."""
    return {key: value for key, value in data.items() if key != "flags"}


def _card(fake: _Server) -> tuple[dict[str, Any], dict[str, Any]]:
    """The list the background work left on the card: its body, and its embed."""
    (edit,) = fake.original_edits()
    assert edit.body is not None
    [embed] = edit.body["embeds"]
    return edit.body, embed


def _ids(event: WowRaidEvent, *verbs: str) -> list[str]:
    return [f"raid:v1:un:{event.id}:{verb}" for verb in verbs]


# ---------------------------------------------------------------------------
# Raid: Unsigned
# ---------------------------------------------------------------------------


async def test_raid_unsigned_lists_who_hasnt_signed_up_by_their_last_class(
    post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    event = await _raid(post, db, fake_discord)
    for n, status, wow_class in ((1, "confirmed", "mage"), (2, "absence", None), (3, "bench", "mage")):
        await _sign_up(db, event.id, n, status, wow_class)
    month_ago = await _old_raid(db, event.guild_id, days=30)
    week_ago = await _old_raid(db, event.guild_id, days=7)
    other = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="800000000000000002", raid_channel_id=CHANNEL)
    elsewhere = await _old_raid(db, other.id, days=1)
    # Dan's latest class is priest (his warrior sign-up was written after it, but changed longer ago);
    # Eve's is warrior (her Absence since has none); Gil only signed up in another server.
    await _sign_up(db, week_ago.id, 4, wow_class="priest")
    older = await _sign_up(db, month_ago.id, 4, wow_class="warrior")
    older.updated_at = datetime.now(timezone.utc) - timedelta(days=30)
    await _sign_up(db, month_ago.id, 5, wow_class="warrior")
    await _sign_up(db, week_ago.id, 5, "absence", None)
    await _sign_up(db, elsewhere.id, 7, wow_class="warrior")
    await db.flush()
    fake_discord.people = [
        _person(1, "Alice", ROLE),
        _person(2, "Bob", ROLE, _TRIAL),
        _person(3, "Cara", ROLE),
        _person(4, "Dan", ROLE),
        _person(5, "Eve", ROLE),
        _person(6, "Raidbot", ROLE, bot=True),
        _person(7, "Gil", ROLE),
        _person(8, "Finn", ROLE, pending=True),  # still on the rules screening
        _person(9, "Hal", _TRIAL),  # holds none of the roles checked
        _person(10, "Ivy", ROLE),
    ]

    # --- the menu answers at once; the list follows once the members are read
    response = await post(menu_command(UNSIGNED_MENU, "m1"))
    assert response == {"type": 5, "data": {"flags": EPHEMERAL}}
    assert fake_discord.pages == [{"limit": "1000", "after": "0"}]
    body, embed = _card(fake_discord)
    assert (body["content"], body["allowed_mentions"]) == ("", {"parse": []})
    assert embed["title"] == "Not signed up (4)"
    assert embed["description"].split("\n\n") == [
        f"{_raid_line(event)}\n{raid_unsigned_copy.pool_line([ROLE], 'pings')}",  # setup's ping role
        f"{_heading('warrior', 1)}\nEve",
        f"{_heading('priest', 1)}\nDan",
        f"{_heading(NO_CLASS_COLUMN, 2)}\nGil, Ivy",
    ]
    assert embed["footer"]["text"] == raid_unsigned_copy.footer(str(event.id)[:6], 7, truncated=False)
    assert custom_ids({"data": body}) == _ids(event, "roles", "ping", "refresh", "back")
    assert fake_discord.channel_posts() == []


async def test_only_its_leader_sees_it_and_not_on_a_cancelled_raid(
    post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.people = [_person(1, "Alice", ROLE)]

    response = await post(menu_command(UNSIGNED_MENU, "m1", user_id="999", permissions=0))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_LEADER
    response = await post(click(_ids(event, "refresh")[0], user_id="999"))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_LEADER)
    assert fake_discord.calls == []
    response = await post(menu_command(UNSIGNED_MENU, "m1", user_id="999", permissions=MANAGE_EVENTS))
    assert response["type"] == 5

    # --- a raid that's done still lists who never answered, without the role menu or a ping
    event.status = "completed"
    event.starts_at = datetime.now(timezone.utc) - timedelta(hours=3)
    await db.flush()
    fake_discord.clear()
    await post(menu_command(UNSIGNED_MENU, "m1"))
    body, embed = _card(fake_discord)
    assert custom_ids({"data": body}) == _ids(event, "ping", "refresh", "back")
    assert body["components"][0]["components"][0]["disabled"] is True
    assert embed["description"].endswith(f"Alice\n\n{raid_copy.RAID_STARTED}")

    event.status = "cancelled"
    await db.flush()
    response = await post(menu_command(UNSIGNED_MENU, "m1"))
    assert content(response) == raid_copy.ALREADY_CANCELLED


async def test_a_big_server_is_read_a_page_at_a_time(
    post: Post, db: AsyncSession, fake_discord: _Server, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    monkeypatch.setattr(raid_member_list, "PAGE_SIZE", 2)
    fake_discord.people = [_person(n, f"Player{n}", ROLE) for n in (5, 1, 4, 2, 3)]

    await post(menu_command(UNSIGNED_MENU, "m1"))
    after = ["0", _id(2), _id(4)]  # each page starts after the highest id on the last
    assert fake_discord.pages == [{"limit": "2", "after": page} for page in after]
    assert _card(fake_discord)[1]["title"] == "Not signed up (5)"

    # --- past MAX_PAGES pages the rest is left out, and the footer says so
    monkeypatch.setattr(raid_member_list, "MAX_PAGES", 2)
    fake_discord.clear()
    response = await post(_lead(_ids(event, "refresh")[0]))
    assert response == _checking(raid_unsigned_copy.CHECKING)
    assert len(fake_discord.pages) == 2
    embed = _card(fake_discord)[1]
    assert embed["title"] == "Not signed up (4)"
    assert embed["footer"]["text"] == raid_unsigned_copy.footer(str(event.id)[:6], 4, truncated=True)


@pytest.mark.parametrize(
    ("refusal", "shown", "logged"),
    [
        ((403, 50001), raid_unsigned_copy.INTENT_OFF, "status 403, code 50001"),
        ((403, 50013), raid_unsigned_copy.fetch_failed(50013, 403), "status 403, code 50013"),
        (None, raid_unsigned_copy.NO_ANSWER, "no answer from Discord (ReadTimeout)"),
    ],
)
async def test_a_member_list_discord_refuses_says_why(
    refusal: tuple[int, int] | None,
    shown: str,
    logged: str,
    post: Post,
    db: AsyncSession,
    fake_discord: _Server,
    caplog: pytest.LogCaptureFixture,
) -> None:
    event = await _raid(post, db, fake_discord)
    if refusal is None:
        fake_discord.time_out("GET", _MEMBERS)
    else:
        fake_discord.fail("GET", _MEMBERS, *refusal)

    with caplog.at_level(logging.WARNING, logger=raid_member_list.logger.name):
        await post(menu_command(UNSIGNED_MENU, "m1"))
    (edit,) = fake_discord.original_edits()
    assert edit.body is not None
    assert (edit.body["content"], edit.body["embeds"]) == (f"{_raid_line(event)}\n{shown}", [])
    assert custom_ids({"data": edit.body}) == _ids(event, "refresh", "back")
    [record] = [record for record in caplog.records if record.name == raid_member_list.logger.name]
    assert record.levelno == logging.WARNING
    assert logged in record.getMessage()


async def test_the_role_menu_picks_the_roles_checked_for_the_raid(
    post: Post, db: AsyncSession, fake_discord: _Server, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.people = [_person(1, "Alice", ROLE), _person(2, "Bob", _RAIDER), _person(3, "Cara", _RAIDER, _TRIAL)]
    locked: list[uuid.UUID] = []
    get_for_update = wow_raid_event_repo.get_for_update

    async def spy(session: AsyncSession, event_id: uuid.UUID) -> WowRaidEvent | None:
        locked.append(event_id)
        return await get_for_update(session, event_id)

    monkeypatch.setattr(wow_raid_event_repo, "get_for_update", spy)
    menu = _ids(event, "roles")[0]

    # --- the roles picked are saved for this raid, under its row lock, and their holders listed
    response = await post(pick_roles(menu, {_RAIDER: True, _TRIAL: False}))
    assert response == _checking(raid_unsigned_copy.CHECKING)
    assert locked == [event.id]
    await db.refresh(event)
    assert event.raider_role_ids == [_RAIDER, _TRIAL]
    body, embed = _card(fake_discord)
    assert body["content"] == raid_unsigned_copy.roles_saved([_RAIDER, _TRIAL])
    assert embed["title"] == "Not signed up (2)"
    assert embed["description"].split("\n\n")[0].endswith(raid_unsigned_copy.pool_line([_RAIDER, _TRIAL], "raid"))
    assert body["components"][0]["components"][0]["default_values"] == [
        {"id": _RAIDER, "type": "role"},
        {"id": _TRIAL, "type": "role"},
    ]

    # --- @everyone is refused (alone, nothing changes); the default roles, or none, go back to the default
    everyone_too = f"{raid_unsigned_copy.roles_saved([_RAIDER])} {raid_unsigned_copy.EVERYONE_REFUSED}"
    for picked, saved, notice in (
        ({GUILD: False}, [_RAIDER, _TRIAL], raid_unsigned_copy.EVERYONE_REFUSED),
        ({GUILD: False, _RAIDER: True}, [_RAIDER], everyone_too),
        ({ROLE: True}, None, raid_unsigned_copy.ROLES_RESET),  # the very role it pings
        ({}, None, raid_unsigned_copy.ROLES_RESET),
    ):
        fake_discord.clear()
        await post(pick_roles(menu, picked))
        await db.refresh(event)
        assert event.raider_role_ids == saved
        assert _card(fake_discord)[0]["content"] == notice
    assert _card(fake_discord)[1]["description"].split("\n\n")[0].endswith(
        raid_unsigned_copy.pool_line([ROLE], "pings")
    )


async def test_with_no_roles_anywhere_the_card_offers_the_menu(
    post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    event = await _raid(post, db, fake_discord, ping_role=None)
    fake_discord.people = [_person(1, "Alice", _RAIDER)]

    response = await post(menu_command(UNSIGNED_MENU, "m1"))
    assert_ephemeral(response)
    lines = [_raid_line(event), raid_unsigned_copy.NO_POOL, raid_unsigned_copy.NO_POOL_ADMIN]
    assert content(response) == "\n".join(lines)
    assert custom_ids(response) == _ids(event, "roles")
    response = await post(menu_command(UNSIGNED_MENU, "m1", permissions=MANAGE_EVENTS))
    assert content(response) == "\n".join(lines[:2])  # where the default is set is for Manage Server
    assert fake_discord.calls == []

    await post(pick_roles(_ids(event, "roles")[0], {_RAIDER: True}))
    body, embed = _card(fake_discord)
    assert body["content"] == raid_unsigned_copy.roles_saved([_RAIDER])
    assert embed["title"] == "Not signed up (1)"


async def test_not_signed_up_opens_from_raid_signed_and_goes_back(
    post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event.id, 1)
    fake_discord.people = [_person(1, "Alice", ROLE), _person(2, "Bob", ROLE)]

    response = await post(menu_command(SIGNED_MENU, "m1"))
    assert custom_ids(response)[-1] == _ids(event, "open")[0]
    response = await post(_lead(_ids(event, "open")[0]))
    assert response == _checking(raid_unsigned_copy.CHECKING)
    body, embed = _card(fake_discord)
    assert embed["description"].split("\n\n")[1:] == [f"{_heading(NO_CLASS_COLUMN, 1)}\nBob"]

    response = await post(_lead(_ids(event, "back")[0]))
    assert response["type"] == 7
    assert response["data"]["embeds"][0]["title"] == "Signed up (1/5)"
    assert custom_ids(response)[-1] == _ids(event, "open")[0]

    # --- [Refresh] reads the list again
    fake_discord.clear()
    response = await post(_lead(_ids(event, "refresh")[0]))
    assert response == _checking(raid_unsigned_copy.CHECKING)
    assert _card(fake_discord)[1]["title"] == "Not signed up (1)"


# ---------------------------------------------------------------------------
# [Ping them]
# ---------------------------------------------------------------------------


async def test_ping_them_pings_only_who_hasnt_signed_up(post: Post, db: AsyncSession, fake_discord: _Server) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event.id, 1)
    fake_discord.people = [_person(n, f"Player{n}", ROLE) for n in (1, 2, 3, 4)]
    form = f"raid:v1:m:{event.id}:uping"

    # --- a blank message sends nothing and claims nothing
    response = await post(modal_submit(form, {"message": "   "}))
    assert response == _checking(raid_unsigned_copy.CHECKING)
    assert _card(fake_discord)[0]["content"] == raid_copy.PING_EMPTY

    # --- [Ping them] opens the form; its submit pings the three not signed up, in a reply to the post
    response = await post(_lead(_ids(event, "ping")[0]))
    assert (response["type"], response["data"]["custom_id"]) == (9, form)
    fake_discord.clear()
    response = await post(modal_submit(form, {"message": "  Sign up tonight  "}))
    assert response == _checking(raid_unsigned_copy.CHECKING_PING)
    (ping,) = fake_discord.channel_posts()
    unsigned = [_id(2), _id(3), _id(4)]
    signature = f"-# Onyxia's Lair · <t:{int(event.starts_at.timestamp())}:F> · sent by Thrall"
    assert ping.body == {
        "content": f"Sign up tonight\n<@{unsigned[0]}> <@{unsigned[1]}> <@{unsigned[2]}>\n{signature}",
        "allowed_mentions": {"parse": [], "users": unsigned, "replied_user": False},
        "message_reference": {"message_id": "m1", "fail_if_not_exists": False},
    }
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None and outcome.body["content"] == raid_copy.ping_sent(3)
    await db.refresh(event)
    assert event.unsigned_pinged_at is not None and event.last_pinged_at is None

    # --- straight away again: the list, saying to wait; a form left open sends nothing
    fake_discord.clear()
    for again in (_lead(_ids(event, "ping")[0]), modal_submit(form, {"message": "Again"})):
        assert await post(again) == _checking(raid_unsigned_copy.CHECKING)
    edits = fake_discord.original_edits()
    assert [edit.body["content"] for edit in edits if edit.body is not None] == [raid_copy.PING_WAIT] * 2
    assert fake_discord.channel_posts() == []

    # --- Raid: Signed's ping has a slot of its own
    response = await post(_lead(f"raid:v1:lc:{event.id}:ping"))
    assert response["type"] == 9


@pytest.mark.parametrize("why", ["nobody", "too_many", "intent_off"])
async def test_a_ping_that_cant_go_out_hands_the_slot_back(
    why: str, post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    event = await _raid(post, db, fake_discord)
    people = {"nobody": 0, "too_many": MAX_PING + 1, "intent_off": 1}[why]
    fake_discord.people = [_person(n, f"Player{n}", ROLE) for n in range(people)]
    if why == "intent_off":
        fake_discord.fail("GET", _MEMBERS, 403, 50001)

    response = await post(modal_submit(f"raid:v1:m:{event.id}:uping", {"message": "Sign up!"}))
    assert response == _checking(raid_unsigned_copy.CHECKING_PING)
    (edit,) = fake_discord.original_edits()
    assert edit.body is not None
    shown = {
        "nobody": raid_unsigned_copy.NOBODY_TO_PING,
        "too_many": "",  # the reason is under the list, which stays in view
        "intent_off": f"{_raid_line(event)}\n{raid_unsigned_copy.INTENT_OFF}",
    }
    assert edit.body["content"] == shown[why]
    if why == "too_many":
        line = raid_unsigned_copy.block_line("too_many")
        assert line is not None and edit.body["embeds"][0]["description"].endswith(line)
    assert fake_discord.channel_posts() == []
    await db.refresh(event)
    assert event.unsigned_pinged_at is None

    # --- nobody was pinged, so the leader can try again at once
    response = await post(_lead(_ids(event, "ping")[0]))
    assert response["type"] == 9


# ---------------------------------------------------------------------------
# /raid-admin raiders
# ---------------------------------------------------------------------------


async def test_raid_admin_raiders_sets_the_servers_default(
    post: Post, db: AsyncSession, fake_discord: _Server
) -> None:
    response = await post(command("raid-admin", "raiders"))
    assert content(response) == raid_copy.NOT_CONFIGURED
    await _raid(post, db, fake_discord)
    fake_discord.people = [_person(1, "Alice", ROLE), _person(2, "Bob", _RAIDER), _person(3, "Cara", _TRIAL)]

    # --- Manage Server only, the menu's picks too
    response = await post(command("raid-admin", "raiders", permissions=MANAGE_EVENTS))
    assert content(response) == raid_copy.NOT_PERMITTED_GUILD
    response = await post(pick_roles(_RAIDERS_MENU, {_RAIDER: True}, permissions=MANAGE_EVENTS))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_PERMITTED_GUILD)
    assert fake_discord.calls == []

    response = await post(command("raid-admin", "raiders"))
    assert response == {"type": 5, "data": {"flags": EPHEMERAL}}
    assert [edit.body for edit in fake_discord.original_edits()] == [_shown(raiders_data([]))]

    # --- the roles picked are checked on every raid that hasn't picked its own
    fake_discord.clear()
    response = await post(pick_roles(_RAIDERS_MENU, {_RAIDER: True, _TRIAL: True}))
    assert response == _checking(raid_unsigned_copy.CHECKING_ROLES)
    guild = await wow_raid_guild_repo.get_by_discord_id(db, GUILD)
    assert guild is not None
    await db.refresh(guild)
    assert guild.raider_role_ids == [_RAIDER, _TRIAL]
    notice = raid_unsigned_copy.raiders_saved([_RAIDER, _TRIAL])
    assert [edit.body for edit in fake_discord.original_edits()] == [
        _shown(raiders_data([_RAIDER, _TRIAL], notice=notice))
    ]

    # --- a role deleted since is left out, and the list says so
    fake_discord.role_ids.remove(_TRIAL)
    fake_discord.clear()
    await post(menu_command(UNSIGNED_MENU, "m1"))
    body, embed = _card(fake_discord)
    assert body["content"] == raid_unsigned_copy.ROLES_GONE
    assert embed["description"].split("\n\n")[0].endswith(raid_unsigned_copy.pool_line([_RAIDER], "server"))
    assert embed["title"] == "Not signed up (1)"

    # --- @everyone alone changes nothing; emptying the menu clears them
    for picked, saved, shown in (
        ({GUILD: False}, [_RAIDER, _TRIAL], raiders_data([_RAIDER], notice=raid_unsigned_copy.EVERYONE_REFUSED)),
        ({}, None, raiders_data([], notice=raid_unsigned_copy.RAIDERS_CLEARED)),
    ):
        fake_discord.clear()
        await post(pick_roles(_RAIDERS_MENU, picked))
        await db.refresh(guild)
        assert guild.raider_role_ids == saved
        assert [edit.body for edit in fake_discord.original_edits()] == [_shown(shown)]


# ---------------------------------------------------------------------------
# The columns (migration 0040)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("table", ["wow_raid_guild", "wow_raid_event"])
@pytest.mark.parametrize("value", ["{}", "null"])
async def test_raider_roles_are_a_json_array_or_sql_null(db: AsyncSession, table: str, value: str) -> None:
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=GUILD, raid_channel_id=CHANNEL)
    rows = {"wow_raid_guild": guild.id, "wow_raid_event": (await _old_raid(db, guild.id, days=1)).id}
    statement = text(f"UPDATE {table} SET raider_role_ids = CAST(:value AS jsonb) WHERE id = :id")
    with pytest.raises(IntegrityError, match=f"ck_{table.replace('_', '')}_raider_role_ids"):
        await db.execute(statement, {"value": value, "id": rows[table]})


def test_0040_follows_0039() -> None:
    spec = importlib.util.spec_from_file_location("migration_0040", _MIGRATION)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert (migration.revision, migration.down_revision) == ("0040", "0039")
