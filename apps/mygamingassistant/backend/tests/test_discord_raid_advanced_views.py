"""Unit tests for Raid: Edit → Advanced's cards and form, and /raid-admin advanced's (pure builders).

What each card says and offers per state — the raid's own settings or the
server's, a draft or a posted raid — [Advanced] ending row 3 of Raid: Edit and
More options, and every card keeping to Discord's limits with ids that parse
back.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_advanced_copy
from app.services.discord.raid_advanced_copy import (
    SERVER_FOOTNOTE,
    SERVER_INTRO,
    SERVER_READY_PROMPT,
    SERVER_WHO_PROMPT,
    WHO_FOOTNOTE,
)
from app.services.discord.raid_advanced_views import (
    advanced_button,
    advanced_card,
    minimum_modal,
    ready_card,
    server_card,
    server_ready_card,
    server_who_card,
    who_card,
)
from app.services.discord.raid_draft_views import options_data
from app.services.discord.raid_edit_views import edit_card
from app.services.wow import raid_custom_id
from app.services.wow.raid_advanced import READY_CHOICES
from app.services.wow.raid_details import TITLE_MAX

_EV = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_LABEL = "Onyxia's Lair · Sat Oct 10"


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": "800000000000000001",
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
        "settings": None,
        "signup_role_ids": None,
        "banned_role_ids": None,
    }
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EV,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "notes": None,
        "cancel_reason": None,
        "title": None,
        "min_signups": None,
        "signup_role_ids": None,
        "banned_role_ids": None,
        "ready_check_minutes": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _id(verb: str, arg: str = "-") -> str:
    return f"raid:v1:adv:{_EV}:{verb}:{arg}"


def _lines(data: dict[str, Any]) -> list[str]:
    return data["content"].split("\n")


def _rows(data: dict[str, Any]) -> list[list[dict[str, Any]]]:
    return [row["components"] for row in data["components"]]


def _buttons(data: dict[str, Any]) -> list[tuple[str, str]]:
    return [(c["label"], c["custom_id"]) for row in _rows(data) for c in row if c["type"] == 2]


def _defaults(menu: dict[str, Any]) -> list[str]:
    return [option["value"] for option in menu["options"] if option.get("default")]


# ---------------------------------------------------------------------------
# The raid's card
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["draft", "scheduled"])
def test_the_card_says_each_setting_and_that_the_server_sets_it(status: str) -> None:
    data = advanced_card(_event(status=status), _guild())
    assert (data["flags"], data["embeds"], data["allowed_mentions"]) == (64, [], {"parse": []})
    assert _lines(data) == [
        f"**Advanced — {_LABEL}**",
        "Minimum sign-ups: none",
        "Who can sign up: everyone (server default)",
        "Can't sign up: nobody (server default)",
        "Ready check: **1 hour** before the start (server default)",
    ]
    [[menu], [back]] = _rows(data)
    assert (menu["custom_id"], menu["placeholder"]) == (_id("pick"), "Change a setting…")
    assert [(o["label"], o["value"], o["description"]) for o in menu["options"]] == [
        ("Minimum sign-ups", "min", "No minimum"),
        ("Who can sign up", "who", "Open to everyone (server default)"),
        ("Ready check", "ready", "1 hour before the start (server default)"),
    ]
    # Back is Raid: Edit's own: More options for a draft, the edit card otherwise.
    assert (back["label"], back["custom_id"]) == ("Back", f"raid:v1:ed:{_EV}:back")


def test_the_card_with_the_raids_own_settings() -> None:
    guild = _guild(signup_role_ids=["609"], settings={"ready_check_minutes": 30})
    event = _event(min_signups=10, signup_role_ids=["601", "602"], banned_role_ids=["603"], ready_check_minutes=0)
    data = advanced_card(event, guild, notice="Saved.")
    assert _lines(data)[1:] == [
        "Minimum sign-ups: **10** — below that when sign-ups close, the raid is cancelled",
        "Who can sign up: <@&601> <@&602>",
        "Can't sign up: <@&603>",
        "Ready check: **off**",
        "-# Saved.",
    ]
    assert [o["description"] for o in _rows(data)[0][0]["options"]] == [
        "10 seats, or the raid is cancelled when sign-ups close",
        "Open to 2 roles · 1 role blocked",
        "Off",
    ]


def test_the_card_mixes_the_raids_settings_with_the_servers() -> None:
    guild = _guild(banned_role_ids=["603"], settings={"ready_check_minutes": 30})
    event = _event(size_cap=10, min_signups=12, signup_role_ids=[])
    data = advanced_card(event, guild)
    assert _lines(data)[1:] == [
        "Minimum sign-ups: **12** — the raid has 10 seats, so all 10 must be filled",
        "Who can sign up: everyone",
        "Can't sign up: <@&603> (server default)",
        "Ready check: **30 minutes** before the start (server default)",
    ]
    assert [o["description"] for o in _rows(data)[0][0]["options"]] == [
        "All 10 seats, or the raid is cancelled when sign-ups close",
        "Open to everyone · 1 role blocked",
        "30 minutes before the start (server default)",
    ]


# ---------------------------------------------------------------------------
# Who can sign up, Ready check, Minimum sign-ups
# ---------------------------------------------------------------------------


def test_the_who_card_holds_the_raids_own_lists_and_offers_the_way_back() -> None:
    guild = _guild(signup_role_ids=["601"])
    following = who_card(_event(), guild)
    [[allow], [ban], _] = _rows(following)
    assert (allow["type"], allow["custom_id"], allow["min_values"], allow["max_values"]) == (6, _id("allow"), 0, 10)
    assert (ban["type"], ban["custom_id"], ban["min_values"], ban["max_values"]) == (6, _id("ban"), 0, 10)
    assert allow["default_values"] == [] and ban["default_values"] == []
    assert _buttons(following) == [("Everyone can sign up", _id("all")), ("Back", _id("open"))]
    assert _lines(following) == [
        f"Who can sign up for **{_LABEL}**?",
        "Who can sign up: <@&601> (server default)",
        "Can't sign up: nobody (server default)",
        WHO_FOOTNOTE,
    ]

    own = who_card(_event(signup_role_ids=["602"], banned_role_ids=[]), guild, notice="Saved.")
    assert _rows(own)[0][0]["default_values"] == [{"id": "602", "type": "role"}]
    assert _buttons(own) == [
        ("Everyone can sign up", _id("all")),
        ("Use server default", _id("inherit", "who")),
        ("Back", _id("open")),
    ]
    assert _lines(own)[1:] == ["Who can sign up: <@&602>", "Can't sign up: nobody", WHO_FOOTNOTE, "-# Saved."]

    everyone = who_card(_event(signup_role_ids=[]), guild)
    assert _buttons(everyone) == [("Use server default", _id("inherit", "who")), ("Back", _id("open"))]
    assert _buttons(who_card(_event(), _guild())) == [("Back", _id("open"))]


def test_the_ready_card_offers_the_server_default_then_the_times() -> None:
    data = ready_card(_event(), _guild(settings={"ready_check_minutes": 30}))
    [[menu], [back]] = _rows(data)
    assert (menu["custom_id"], menu["min_values"], menu["max_values"]) == (_id("ready"), 1, 1)
    assert [(o["label"], o["value"]) for o in menu["options"]] == [
        ("Server default (30 minutes)", "inherit"),
        ("Off", "0"),
        ("15 minutes before", "15"),
        ("30 minutes before", "30"),
        ("45 minutes before", "45"),
        ("1 hour before", "60"),
        ("90 minutes before", "90"),
        ("2 hours before", "120"),
        ("3 hours before", "180"),
    ]
    assert _defaults(menu) == ["inherit"]
    assert (back["label"], back["custom_id"]) == ("Back", _id("open"))
    assert _lines(data)[0].startswith(f"Ready check for **{_LABEL}** — the bot posts in the raid channel")
    assert _lines(data)[1] == "Ready check: **30 minutes** before the start (server default)"

    own = ready_card(_event(ready_check_minutes=90), _guild(settings={"ready_check_minutes": 0}))
    menu = _rows(own)[0][0]
    assert menu["options"][0]["label"] == "Server default (off)"
    assert _defaults(menu) == ["90"]
    assert _lines(own)[1] == "Ready check: **90 minutes** before the start"


def test_the_minimum_form_holds_the_raids_minimum() -> None:
    form = minimum_modal(_event(min_signups=10))
    assert (form["type"], form["data"]["custom_id"], form["data"]["title"]) == (
        9,
        f"raid:v1:m:{_EV}:advmin",
        "Minimum sign-ups",
    )
    [label] = form["data"]["components"]
    assert (label["type"], label["label"], label["description"]) == (
        18,
        "Cancel the raid if fewer sign up",
        "Checked once, when sign-ups close. Seats count: Confirmed and Late.",
    )
    assert label["component"] == {
        "type": 4,
        "custom_id": "value",
        "style": 1,
        "max_length": 2,
        "required": False,
        "value": "10",
        "placeholder": "e.g. 10 — leave empty for no minimum",
    }
    assert "value" not in minimum_modal(_event())["data"]["components"][0]["component"]


# ---------------------------------------------------------------------------
# /raid-admin advanced
# ---------------------------------------------------------------------------


def test_the_server_card_says_the_servers_own_settings() -> None:
    data = server_card(_guild())
    assert _lines(data) == [
        "**Server defaults**",
        SERVER_INTRO,
        "Who can sign up: everyone",
        "Can't sign up: nobody",
        "Ready check: **1 hour** before the start",
        SERVER_FOOTNOTE,
    ]
    [[menu]] = _rows(data)
    assert menu["custom_id"] == "raid:v1:sadv:pick:-"
    assert [(o["label"], o["value"], o["description"]) for o in menu["options"]] == [
        ("Who can sign up", "who", "Open to everyone"),
        ("Ready check", "ready", "1 hour before the start"),
    ]
    set_up = _guild(signup_role_ids=["601"], banned_role_ids=["603", "604"], settings={"ready_check_minutes": 0})
    assert _lines(server_card(set_up, notice="Saved."))[2:] == [
        "Who can sign up: <@&601>",
        "Can't sign up: <@&603> <@&604>",
        "Ready check: **off**",
        SERVER_FOOTNOTE,
        "-# Saved.",
    ]


def test_the_servers_who_and_ready_cards() -> None:
    guild = _guild(signup_role_ids=["601"], banned_role_ids=["603", "604"], settings={"ready_check_minutes": 0})
    who = server_who_card(guild)
    assert [(row[0]["custom_id"], row[0]["default_values"]) for row in _rows(who)[:2]] == [
        ("raid:v1:sadv:allow:-", [{"id": "601", "type": "role"}]),
        ("raid:v1:sadv:ban:-", [{"id": "603", "type": "role"}, {"id": "604", "type": "role"}]),
    ]
    assert _buttons(who) == [("Back", "raid:v1:sadv:open:-")]
    lists = ["Who can sign up: <@&601>", "Can't sign up: <@&603> <@&604>"]
    assert _lines(who) == [SERVER_WHO_PROMPT, *lists, WHO_FOOTNOTE]

    ready = server_ready_card(guild)
    menu = _rows(ready)[0][0]
    # No server default to follow: just the times, the server's own checked.
    assert (menu["custom_id"], [o["value"] for o in menu["options"]]) == (
        "raid:v1:sadv:ready:-",
        [str(minutes) for minutes in READY_CHOICES],
    )
    assert _defaults(menu) == ["0"]
    assert _defaults(_rows(server_ready_card(_guild()))[0][0]) == ["60"]
    assert _lines(ready) == [SERVER_READY_PROMPT, "Ready check: **off**"]
    assert _buttons(ready) == [("Back", "raid:v1:sadv:open:-")]


# ---------------------------------------------------------------------------
# Raid: Edit and More options
# ---------------------------------------------------------------------------


def test_advanced_ends_row_3_of_raid_edit_and_more_options() -> None:
    advanced = ("Advanced", 2, _id("open"))
    assert (advanced_button(_event())["label"], advanced_button(_event())["style"]) == advanced[:2]
    edit = edit_card(_event())["components"][2]["components"]
    assert [b["label"] for b in edit] == ["Role limits", "Class limits", "Sign-ups", "Notes: off", "Advanced"]
    assert (edit[-1]["label"], edit[-1]["style"], edit[-1]["custom_id"]) == advanced
    draft = options_data(_event(status="draft"), _guild(), emojis=EMPTY_EMOJIS)["components"][2]["components"]
    assert [b["label"] for b in draft] == ["Role limits", "Class limits", "Notes: off", "Advanced"]
    assert (draft[-1]["label"], draft[-1]["style"], draft[-1]["custom_id"]) == advanced


def test_the_raids_own_settings_show_on_raid_edit_and_more_options() -> None:
    assert raid_advanced_copy.detail_lines(_event()) == []
    own = {"min_signups": 10, "signup_role_ids": ["601", "602"], "banned_role_ids": ["603"], "ready_check_minutes": 90}
    line = "**Advanced:** minimum 10 · open to 2 roles · 1 role blocked · ready check 90 minutes before"
    assert raid_advanced_copy.detail_lines(_event(**own)) == [line]
    assert line in edit_card(_event(**own))["embeds"][0]["description"].split("\n")
    draft = options_data(_event(status="draft", **own), _guild(), emojis=EMPTY_EMOJIS)
    assert line in _lines(draft)
    everyone = _event(signup_role_ids=[], banned_role_ids=[], ready_check_minutes=0)
    open_line = "**Advanced:** open to everyone · nobody blocked · ready check off"
    assert raid_advanced_copy.detail_lines(everyone) == [open_line]
    hour = _event(ready_check_minutes=60)
    assert raid_advanced_copy.detail_lines(hour) == ["**Advanced:** ready check 1 hour before"]


# ---------------------------------------------------------------------------
# Ids and Discord's limits
# ---------------------------------------------------------------------------


def _every_card() -> list[dict[str, Any]]:
    guild = _guild(signup_role_ids=["601"], banned_role_ids=["603"], settings={"ready_check_minutes": 45})
    own = _event(min_signups=10, signup_role_ids=["602"], banned_role_ids=["604"], ready_check_minutes=90)
    long = _event(title="T" * TITLE_MAX, signup_role_ids=[str(1_300_000_000_000_000_000 + i) for i in range(10)])
    cards = []
    for event in (_event(), own, long, _event(status="draft")):
        cards += [advanced_card(event, guild, notice="Saved."), who_card(event, guild), ready_card(event, guild)]
    return [*cards, server_card(guild, notice="Saved."), server_who_card(guild), server_ready_card(guild)]


def test_every_id_parses_back() -> None:
    ids = [item["custom_id"] for card in _every_card() for row in _rows(card) for item in row]
    ids += [advanced_button(_event())["custom_id"], minimum_modal(_event())["data"]["custom_id"]]
    for custom_id in ids:
        parsed = raid_custom_id.parse(custom_id)
        assert parsed is not None, custom_id
        assert raid_custom_id.encode(parsed.action, parsed.event_id, *parsed.args) == custom_id
    # The longest: [Use server default].
    assert max(len(custom_id) for custom_id in ids) == len(_id("inherit", "who")) == 60
    for stale in (_id("inherit"), _id("back"), _id("open", "who"), "raid:v1:sadv:all:-", "raid:v1:sadv:inherit:who"):
        assert raid_custom_id.parse(stale) is None, stale


def test_every_card_keeps_to_discords_limits() -> None:
    for card in _every_card():
        assert len(card["content"]) <= 2000
        assert 0 < len(card["components"]) <= 5
        for row in _rows(card):
            assert len(row) <= 5
            assert all(item["type"] == 2 for item in row) or len(row) == 1  # a menu fills its row
            for item in row:
                assert len(item.get("label", "")) <= 80
                assert len(item.get("placeholder", "")) <= 150
                assert len(item.get("options", [])) <= 25
                for option in item.get("options", []):
                    assert len(option["label"]) <= 100 and len(option.get("description", "")) <= 100
