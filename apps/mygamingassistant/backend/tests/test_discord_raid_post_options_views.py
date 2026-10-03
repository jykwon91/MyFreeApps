"""Unit tests for Raid: Edit → Advanced's post-option cards and /raid-admin advanced's (pure builders).

Pin the post — the raid's own choice lit, every button off while the pin
changes; Voice channel — a menu of voice and stage channels holding the
raid's own, then [No voice channel] and [Use server default]; Delete the
post — a menu of delays after the raid; the server's pin and voice cards.
Every card keeps to Discord's limits, with ids that parse back.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_post_options_copy
from app.services.discord.raid_advanced_copy import INHERIT_NOTICE
from app.services.discord.raid_advanced_views import (
    delete_card,
    pin_card,
    server_pin_card,
    server_voice_card,
    voice_card,
)
from app.services.discord.raid_post_options_copy import (
    DELETE_STAYS,
    PIN_UNTIL,
    SERVER_PIN_NEEDS,
    SERVER_PIN_PROMPT,
    SERVER_VOICE_PROMPT,
)
from app.services.wow import raid_custom_id
from app.services.wow.raid_advanced import NO_VOICE, PinResult
from app.services.wow.raid_details import TITLE_MAX

_EV = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_LABEL = "Onyxia's Lair · Sat Oct 10"
_VOICE = "710000000000000009"
_OWN_VOICE = "710000000000000008"
_PRIMARY = 1
_SECONDARY = 2
_SERVER_BACK = ("Back", "raid:v1:sadv:open:-", _SECONDARY, False)


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
        "pin_posts": False,
        "voice_channel_id": None,
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
        "message_id": "710000000000000001",
        "pin_post": None,
        "pinned_message_id": None,
        "voice_channel_id": None,
        "delete_post_after_hours": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _id(verb: str, arg: str = "-") -> str:
    return f"raid:v1:adv:{_EV}:{verb}:{arg}"


def _lines(data: dict[str, Any]) -> list[str]:
    return data["content"].split("\n")


def _rows(data: dict[str, Any]) -> list[list[dict[str, Any]]]:
    return [row["components"] for row in data["components"]]


def _buttons(data: dict[str, Any]) -> list[tuple[str, str, int, bool]]:
    """Each button: (label, id, style, greyed out)."""
    return [
        (c["label"], c["custom_id"], c["style"], c.get("disabled", False))
        for row in _rows(data)
        for c in row
        if c["type"] == 2
    ]


def _lit(data: dict[str, Any]) -> list[tuple[int, bool]]:
    """Each button's (style, greyed out): the choice in force stands out, greyed out."""
    return [(style, off) for _, _, style, off in _buttons(data)]


def _defaults(menu: dict[str, Any]) -> list[str]:
    return [option["value"] for option in menu["options"] if option.get("default")]


# ---------------------------------------------------------------------------
# Pin the post
# ---------------------------------------------------------------------------


def test_the_pin_card_lights_the_server_default_while_the_raid_follows_it() -> None:
    data = pin_card(_event(), _guild())
    assert (data["flags"], data["embeds"], data["allowed_mentions"]) == (64, [], {"parse": []})
    assert _lines(data) == [f"Pin the post for **{_LABEL}**?", PIN_UNTIL, "Pin the post: **off** (server default)"]
    assert _buttons(data) == [
        ("Pin it", _id("on", "pin"), _SECONDARY, False),
        ("Don't pin", _id("off", "pin"), _SECONDARY, False),
        ("Server default (off)", _id("inherit", "pin"), _PRIMARY, True),
        ("Back", _id("open"), _SECONDARY, False),
    ]
    on = pin_card(_event(), _guild(pin_posts=True))
    assert _lines(on)[2] == "Pin the post: **on** until the raid starts (server default)"
    assert _buttons(on)[2] == ("Server default (on)", _id("inherit", "pin"), _PRIMARY, True)


def test_the_pin_card_lights_the_raids_own_choice() -> None:
    on = pin_card(_event(pin_post=True), _guild(), notice="Saved.")
    assert _lines(on)[2:] == ["Pin the post: **on** until the raid starts", "-# Saved."]
    assert _lit(on) == [(_PRIMARY, True), (_SECONDARY, False), (_SECONDARY, False), (_SECONDARY, False)]
    off = pin_card(_event(pin_post=False), _guild(pin_posts=True))
    assert _lines(off)[2] == "Pin the post: **off**"
    assert _lit(off) == [(_SECONDARY, False), (_PRIMARY, True), (_SECONDARY, False), (_SECONDARY, False)]


def test_the_pin_card_is_all_off_while_the_pin_changes() -> None:
    data = pin_card(_event(pin_post=True), _guild(), notice=raid_post_options_copy.busy(True), busy=True)
    assert [off for _, off in _lit(data)] == [True, True, True, True]
    assert _lines(data)[-1] == "-# Pinning the post…"


# ---------------------------------------------------------------------------
# Voice channel
# ---------------------------------------------------------------------------


def test_the_voice_card_offers_the_servers_voice_channels() -> None:
    data = voice_card(_event(), _guild(voice_channel_id=_VOICE))
    [[menu], _] = _rows(data)
    assert menu == {
        "type": 8,
        "custom_id": _id("voice"),
        "placeholder": "Pick a voice channel",
        "channel_types": [2, 13],
        "min_values": 1,
        "max_values": 1,
        "default_values": [],
    }
    assert _buttons(data) == [
        ("No voice channel", _id("off", "voice"), _SECONDARY, False),
        ("Use server default", _id("inherit", "voice"), _PRIMARY, True),
        ("Back", _id("open"), _SECONDARY, False),
    ]
    assert _lines(data) == [
        f"Voice channel for **{_LABEL}** — the post shows a link to it.",
        f"Voice channel: <#{_VOICE}> (server default)",
    ]


def test_the_voice_card_holds_the_raids_own_channel_or_none() -> None:
    server = _guild(voice_channel_id=_VOICE)
    own = voice_card(_event(voice_channel_id=_OWN_VOICE), server, notice="Saved.")
    assert _rows(own)[0][0]["default_values"] == [{"id": _OWN_VOICE, "type": "channel"}]
    assert _lit(own) == [(_SECONDARY, False)] * 3
    assert _lines(own)[1:] == [f"Voice channel: <#{_OWN_VOICE}>", "-# Saved."]

    none = voice_card(_event(voice_channel_id=NO_VOICE), server)
    assert _rows(none)[0][0]["default_values"] == []
    assert _lit(none) == [(_PRIMARY, True), (_SECONDARY, False), (_SECONDARY, False)]
    assert _lines(none)[1] == "Voice channel: none"
    assert _lines(voice_card(_event(), _guild()))[1] == "Voice channel: none (server default)"


# ---------------------------------------------------------------------------
# Delete the post
# ---------------------------------------------------------------------------


def test_the_delete_card_offers_keep_then_the_delays() -> None:
    data = delete_card(_event(), _guild())
    [[menu], [back]] = _rows(data)
    assert (menu["type"], menu["custom_id"], menu["placeholder"]) == (3, _id("del"), "When should the post go?")
    assert [(o["label"], o["value"]) for o in menu["options"]] == [
        ("Keep the post", "keep"),
        ("3 hours after", "3"),
        ("6 hours after", "6"),
        ("12 hours after", "12"),
        ("1 day after", "24"),
        ("2 days after", "48"),
        ("1 week after", "168"),
    ]
    assert _defaults(menu) == ["keep"]
    assert (back["label"], back["custom_id"]) == ("Back", _id("open"))
    assert _lines(data) == [
        f"Delete the post for **{_LABEL}** after the raid?",
        DELETE_STAYS,
        "Delete the post: **never**",
    ]
    own = delete_card(_event(delete_post_after_hours=48), _guild())
    assert _defaults(_rows(own)[0][0]) == ["48"]
    assert _lines(own)[2] == "Delete the post: **2 days** after the raid"


# ---------------------------------------------------------------------------
# /raid-admin advanced
# ---------------------------------------------------------------------------


def test_the_servers_pin_card() -> None:
    off = server_pin_card(_guild())
    assert _lines(off) == [SERVER_PIN_PROMPT, SERVER_PIN_NEEDS, "Pin the post: **off**"]
    assert _buttons(off) == [
        ("Pin raid posts", "raid:v1:sadv:on:pin", _SECONDARY, False),
        ("Don't pin", "raid:v1:sadv:off:pin", _PRIMARY, True),
        _SERVER_BACK,
    ]
    on = server_pin_card(_guild(pin_posts=True), notice="Saved.")
    assert _lines(on)[2:] == ["Pin the post: **on** until the raid starts", "-# Saved."]
    assert _lit(on) == [(_PRIMARY, True), (_SECONDARY, False), (_SECONDARY, False)]


def test_the_servers_voice_card() -> None:
    none = server_voice_card(_guild())
    [[menu], _] = _rows(none)
    assert (menu["type"], menu["custom_id"], menu["channel_types"], menu["default_values"]) == (
        8,
        "raid:v1:sadv:voice:-",
        [2, 13],
        [],
    )
    assert _buttons(none) == [("No voice channel", "raid:v1:sadv:off:voice", _PRIMARY, True), _SERVER_BACK]
    assert _lines(none) == [SERVER_VOICE_PROMPT, "Voice channel: none"]

    linked = server_voice_card(_guild(voice_channel_id=_VOICE), notice="Saved.")
    assert _rows(linked)[0][0]["default_values"] == [{"id": _VOICE, "type": "channel"}]
    assert _lit(linked) == [(_SECONDARY, False), (_SECONDARY, False)]
    assert _lines(linked) == [SERVER_VOICE_PROMPT, f"Voice channel: <#{_VOICE}>", "-# Saved."]


# ---------------------------------------------------------------------------
# Ids and Discord's limits
# ---------------------------------------------------------------------------


def _every_card() -> list[dict[str, Any]]:
    problem = raid_post_options_copy.pin_problem(PinResult("unpin", "full", "700000000000000001"))
    events = (
        _event(),
        _event(pin_post=True, voice_channel_id=_OWN_VOICE, delete_post_after_hours=168),
        _event(pin_post=False, voice_channel_id=NO_VOICE, delete_post_after_hours=3),
        _event(title="T" * TITLE_MAX, status="draft", message_id=None),
    )
    cards = []
    for guild in (_guild(), _guild(pin_posts=True, voice_channel_id=_VOICE)):
        cards += [server_pin_card(guild, notice="Saved."), server_voice_card(guild, notice="Saved.")]
        for event in events:
            cards += [
                pin_card(event, guild, notice=problem),
                pin_card(event, guild, notice=raid_post_options_copy.busy(True), busy=True),
                voice_card(event, guild, notice=INHERIT_NOTICE),
                delete_card(event, guild),
            ]
    return cards


def test_every_id_parses_back() -> None:
    ids = [item["custom_id"] for card in _every_card() for row in _rows(card) for item in row]
    for custom_id in ids:
        parsed = raid_custom_id.parse(custom_id)
        assert parsed is not None, custom_id
        assert raid_custom_id.encode(parsed.action, parsed.event_id, *parsed.args) == custom_id
    # The longest: the voice card's [Use server default].
    assert max(len(custom_id) for custom_id in ids) == len(_id("inherit", "voice")) == 62


def test_ids_the_cards_never_send_dont_parse() -> None:
    stale = (
        _id("on"),
        _id("off"),
        _id("on", "voice"),
        _id("voice", "pin"),
        _id("del", "pin"),
        _id("pin"),
        "raid:v1:sadv:inherit:pin",
        "raid:v1:sadv:del:-",
        "raid:v1:sadv:on:voice",
    )
    for custom_id in stale:
        assert raid_custom_id.parse(custom_id) is None, custom_id


def test_every_card_keeps_to_discords_limits() -> None:
    for card in _every_card():
        assert len(card["content"]) <= 2000
        assert 0 < len(card["components"]) <= 5
        for row in _rows(card):
            assert len(row) <= 5
            assert all(item["type"] == 2 for item in row) or len(row) == 1  # a menu fills its row
            for item in row:
                assert len(item["custom_id"]) <= 100
                assert len(item.get("label", "")) <= 80
                assert len(item.get("placeholder", "")) <= 150
                assert len(item.get("options", [])) <= 25
                assert len(item.get("default_values", [])) <= item.get("max_values", 1)
                for option in item.get("options", []):
                    assert len(option["label"]) <= 100 and len(option.get("description", "")) <= 100
