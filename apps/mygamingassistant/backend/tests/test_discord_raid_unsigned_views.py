"""Unit tests for app.services.discord.raid_unsigned_views — Raid: Unsigned's cards — and their copy.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_unsigned_copy
from app.services.discord.raid_leader_views import PING_MAX_CHARS
from app.services.discord.raid_unsigned_views import (
    checking_data,
    error_data,
    no_pool_data,
    raiders_data,
    unsigned_data,
    unsigned_ping_modal,
)
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN
from app.services.wow.raid_post_layout import NO_CLASS_COLUMN
from app.services.wow.raid_unsigned import Member, PingBlock, Pool, PoolSource

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_RAID_LINE = f"**Onyxia's Lair** · <t:{int(_STARTS.timestamp())}:F>"
_POOL = Pool(("11", "12"), "server")
_SERVER_LINE = "Checking <@&11> and <@&12> · the server's raider roles"


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "status": "scheduled",
        "title": None,
        "color": None,
        "closed_at": None,
        "start_applied_at": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _members(*names: str) -> list[Member]:
    return [Member(str(1000 + n), name, frozenset({"11"})) for n, name in enumerate(names)]


_COLUMNS = [("warrior", _members("Carl")), ("mage", _members("Alice", "*Bob*")), (NO_CLASS_COLUMN, _members("Dora"))]


def _card(
    event: WowRaidEvent | None = None,
    *,
    pool: Pool = _POOL,
    columns: Sequence[tuple[str, Sequence[Member]]] = _COLUMNS,
    truncated: bool = False,
    block: PingBlock | None = None,
    emojis: EmojiSet = EMPTY_EMOJIS,
    notice: str | None = None,
) -> dict[str, Any]:
    return unsigned_data(
        event or _event(),
        pool=pool,
        expected_count=9,
        columns=columns,
        truncated=truncated,
        block=block,
        emojis=emojis,
        notice=notice,
    )


def _components(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [component for row in data["components"] for component in row["components"]]


def _buttons(data: dict[str, Any]) -> list[tuple[str, int, str, bool]]:
    return [
        (c["label"], c["style"], c["custom_id"], c.get("disabled", False)) for c in _components(data) if c["type"] == 2
    ]


def _description(data: dict[str, Any]) -> str:
    return data["embeds"][0]["description"]


# ---------------------------------------------------------------------------
# The list
# ---------------------------------------------------------------------------


def test_the_list_names_who_hasnt_signed_up_class_by_class() -> None:
    data = _card()
    [embed] = data["embeds"]
    assert embed["title"] == "Not signed up (4)"
    assert embed["description"].split("\n\n") == [
        f"{_RAID_LINE}\n{_SERVER_LINE}",
        "**Warrior (1)**\nCarl",
        "**Mage (2)**\nAlice, \\*Bob\\*",
        "**No class yet (1)**\nDora",
    ]
    assert embed["color"] == COLOR_OPEN
    assert embed["footer"] == {"text": "Raid ID a1b2c3 · 9 members with these roles"}
    assert data["content"] == "" and data["flags"] == 64 and data["allowed_mentions"] == {"parse": []}
    menu = _components(data)[0]
    assert menu == {
        "type": 6,
        "custom_id": f"raid:v1:un:{_EVENT_ID}:roles",
        "placeholder": raid_unsigned_copy.ROLE_PLACEHOLDER,
        "min_values": 0,
        "max_values": 10,
        "default_values": [{"id": "11", "type": "role"}, {"id": "12", "type": "role"}],
    }
    assert _buttons(data) == [
        ("Ping them", 1, f"raid:v1:un:{_EVENT_ID}:ping", False),
        ("Refresh", 2, f"raid:v1:un:{_EVENT_ID}:refresh", False),
        ("Back", 2, f"raid:v1:un:{_EVENT_ID}:back", False),
    ]


@pytest.mark.parametrize(
    ("source", "said"),
    [("raid", "picked for this raid"), ("server", "the server's raider roles"), ("pings", "the roles this raid pings")],
)
def test_the_pool_line_says_where_the_roles_came_from(source: PoolSource, said: str) -> None:
    line = f"Checking <@&1>, <@&2> and <@&3> · {said}"
    assert _description(_card(pool=Pool(("1", "2", "3"), source))).split("\n")[1] == line


def test_a_closed_raid_says_so_and_a_notice_goes_above_the_list() -> None:
    notice = raid_unsigned_copy.roles_saved(["11"])
    data = _card(_event(closed_at=_T0), pool=Pool(("11",), "raid"), block="closed", notice=notice)
    head = f"{_RAID_LINE}\n**Sign-ups are closed.**\nChecking <@&11> · picked for this raid"
    assert _description(data).split("\n\n")[0] == head
    assert data["embeds"][0]["color"] == COLOR_CLOSED
    assert data["content"] == notice == "Saved. This raid checks <@&11>."


def test_class_headings_carry_the_class_icon_once_its_uploaded() -> None:
    icons = EmojiSet(
        {
            "warrior": EmojiRef("1400000000000000001", "warrior__a1b2c3"),
            "info_lock": EmojiRef("1400000000000000002", "info_lock__a1b2c3"),
        }
    )
    sections = _description(_card(_event(closed_at=_T0), emojis=icons)).split("\n\n")
    assert sections[0].split("\n")[1] == "<:info_lock__a1b2c3:1400000000000000002> **Sign-ups are closed.**"
    assert sections[1] == "**<:warrior__a1b2c3:1400000000000000001> Warrior (1)**\nCarl"
    assert sections[2] == "**Mage (2)**\nAlice, \\*Bob\\*"  # no mage icon: the name alone


def test_everyone_signed_up() -> None:
    data = _card(columns=[])
    assert data["embeds"][0]["title"] == "Not signed up (0)"
    assert _description(data) == f"{_RAID_LINE}\n{_SERVER_LINE}\n\n{raid_unsigned_copy.ALL_SIGNED}"


def test_a_long_list_is_clipped_and_the_reason_ping_them_is_off_stays() -> None:
    columns = [(cls, _members(*(f"LongPlayerName_{cls}_{n:02}" for n in range(30)))) for cls in ("warrior", "mage")]
    columns += [(NO_CLASS_COLUMN, _members(*(f"NoClassPlayer_{n:03}" for n in range(150))))]
    data = _card(columns=columns, block="too_many")
    description = _description(data)
    assert len(description) <= EMBED_DESCRIPTION_LIMIT
    assert description.endswith(f"\n\n**No class yet (150)**\n…\n\n{raid_unsigned_copy.block_line('too_many')}")
    assert "**Mage (30)**" in description and "NoClassPlayer" not in description
    assert data["embeds"][0]["title"] == "Not signed up (210)"  # the count is everyone's, shown or not


def test_the_footer_counts_the_members_and_says_when_the_list_was_cut_short() -> None:
    assert raid_unsigned_copy.footer("a1b2c3", 1, truncated=False) == "Raid ID a1b2c3 · 1 member with these roles"
    assert raid_unsigned_copy.footer("a1b2c3", 0, truncated=False) == "Raid ID a1b2c3 · 0 members with these roles"
    footer = _card(truncated=True)["embeds"][0]["footer"]["text"]
    assert footer == "Raid ID a1b2c3 · 9 members with these roles · checked the first 10,000 server members"
    assert raid_unsigned_copy.footer("a1b2c3", 12_345, truncated=True).startswith("Raid ID a1b2c3 · 12,345 members")


_UNDER_THE_LIST = {
    "started": raid_copy.RAID_STARTED,
    "closed": "Sign-ups are closed, so there's no one to call in.",
    "too_many": "That's more than 200 people. Pick narrower roles to ping them.",
}


@pytest.mark.parametrize("block", list(_UNDER_THE_LIST))
def test_a_reason_the_list_shows_stays_under_it(block: PingBlock) -> None:
    assert raid_unsigned_copy.block_line(block) == _UNDER_THE_LIST[block]
    assert raid_unsigned_copy.ping_refused(block) is None  # never twice on one card
    data = _card(block=block)
    assert _description(data) == f"{_description(_card())}\n\n{_UNDER_THE_LIST[block]}"
    assert _buttons(data)[0] == ("Ping them", 1, f"raid:v1:un:{_EVENT_ID}:ping", True)


@pytest.mark.parametrize(
    ("block", "notice"), [("nobody", raid_unsigned_copy.NOBODY_TO_PING), ("cancelled", raid_copy.ALREADY_CANCELLED)]
)
def test_other_reasons_go_above_the_list(block: PingBlock, notice: str) -> None:
    assert raid_unsigned_copy.block_line(block) is None
    assert raid_unsigned_copy.ping_refused(block) == notice
    data = _card(block=block)
    assert _description(data) == _description(_card())
    assert _buttons(data)[0][3] is True


def test_a_raid_thats_done_keeps_its_list_without_the_role_menu() -> None:
    data = _card(_event(status="completed", start_applied_at=_T0), block="started")
    assert [c["type"] for c in _components(data)] == [2, 2, 2]
    assert data["embeds"][0]["color"] == COLOR_CLOSED


# ---------------------------------------------------------------------------
# No roles, errors and "Checking…"
# ---------------------------------------------------------------------------


def test_with_no_roles_anywhere_the_card_asks_for_them() -> None:
    data = no_pool_data(_event(), admin=False)
    assert data["content"] == f"{_RAID_LINE}\n{raid_unsigned_copy.NO_POOL}"
    assert data["embeds"] == []
    [menu] = _components(data)
    assert menu["custom_id"] == f"raid:v1:un:{_EVENT_ID}:roles" and menu["default_values"] == []

    # Manage Server also hears where the server's default is set; a notice comes last.
    admin = no_pool_data(_event(), admin=True, notice=raid_unsigned_copy.ROLES_GONE)
    lines = [_RAID_LINE, raid_unsigned_copy.NO_POOL, raid_unsigned_copy.NO_POOL_ADMIN, raid_unsigned_copy.ROLES_GONE]
    assert admin["content"] == "\n".join(lines)
    assert raid_unsigned_copy.NO_POOL_ADMIN == "Set a default for every raid with `/raid-admin raiders`."
    assert no_pool_data(_event(status="completed"), admin=True)["components"] == []


def test_an_error_card_says_why_with_refresh_and_back() -> None:
    data = error_data(_event(), raid_unsigned_copy.INTENT_OFF)
    assert data["content"] == f"{_RAID_LINE}\n{raid_unsigned_copy.INTENT_OFF}"
    assert data["embeds"] == []
    assert [c["custom_id"] for c in _components(data)] == [
        f"raid:v1:un:{_EVENT_ID}:refresh",
        f"raid:v1:un:{_EVENT_ID}:back",
    ]
    assert "**Server Members Intent**" in raid_unsigned_copy.INTENT_OFF
    assert "Developer Portal → the app → **Bot**" in raid_unsigned_copy.INTENT_OFF
    failed = "Discord didn't give me the member list (error 50013). Try **Refresh** in a minute."
    assert raid_unsigned_copy.fetch_failed(50013, 403) == failed
    assert "(error 502)" in raid_unsigned_copy.fetch_failed(None, 502)


def test_checking_has_nothing_to_press_twice() -> None:
    data = checking_data(raid_unsigned_copy.CHECKING)
    assert data == {
        "content": "Checking who hasn't signed up…",
        "flags": 64,
        "allowed_mentions": {"parse": []},
        "components": [],
        "embeds": [],
    }


# ---------------------------------------------------------------------------
# [Ping them]'s form and /raid-admin raiders
# ---------------------------------------------------------------------------


def test_the_ping_form_is_prefilled_with_a_nudge_to_sign_up() -> None:
    modal = unsigned_ping_modal(_event())
    assert modal["type"] == 9
    assert modal["data"]["custom_id"] == f"raid:v1:m:{_EVENT_ID}:uping"
    assert modal["data"]["title"] == "Ping who hasn't signed up"
    [label] = modal["data"]["components"]
    assert (label["type"], label["label"], label["description"]) == (18, "Message", raid_unsigned_copy.FIELD_HINT)
    field = label["component"]
    assert (field["custom_id"], field["min_length"], field["max_length"]) == ("message", 1, PING_MAX_CHARS)
    assert field["value"] == (
        "Haven't signed up for **Onyxia's Lair** yet? Tap your class on the raid post, "
        "or **Absence** if you can't make it."
    )
    long_title = unsigned_ping_modal(_event(title="X" * 600))["data"]["components"][0]["component"]["value"]
    assert len(long_title) == PING_MAX_CHARS


def test_the_raiders_card_shows_the_servers_roles_in_a_menu() -> None:
    data = raiders_data(["11", "12"], notice=raid_unsigned_copy.raiders_saved(["11", "12"]))
    saved = "Saved. Unsigned checks <@&11> and <@&12> by default."
    assert data["content"] == f"{raid_unsigned_copy.RAIDERS_PROMPT}\n{saved}"
    [menu] = _components(data)
    assert menu == {
        "type": 6,
        "custom_id": "raid:v1:rr",
        "placeholder": raid_unsigned_copy.RAIDERS_PLACEHOLDER,
        "min_values": 0,
        "max_values": 10,
        "default_values": [{"id": "11", "type": "role"}, {"id": "12", "type": "role"}],
    }

    cleared = raiders_data([], notice=raid_unsigned_copy.RAIDERS_CLEARED)
    assert cleared["content"].endswith("\nCleared. Unsigned checks the roles each raid pings.")
    assert _components(cleared)[0]["default_values"] == []
    assert raiders_data([])["content"] == raid_unsigned_copy.RAIDERS_PROMPT
