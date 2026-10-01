"""Unit tests for app.services.discord.raid_views — the private (ephemeral) views.

Pure: no DB, no Discord.  Icons come from an ``EmojiSet`` like the registry
would resolve; with none uploaded the views fall back to text tags and
plain buttons.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord.raid_views import (
    EMBED_DESCRIPTION_LIMIT,
    _clip_lines,
    class_picker_data,
    role_picker_data,
    roster_data,
)
from app.services.wow.raid_catalog import CLASSES

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_ICON = re.compile(r"<:[a-z0-9_]+:\d+>")


def _guild() -> WowRaidGuild:
    return WowRaidGuild(
        id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", ping_role_id=None, timezone="America/New_York"
    )


def _event() -> WowRaidEvent:
    return WowRaidEvent(
        id=uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000"),
        guild_id=uuid.uuid4(),
        raid_key="onyxia",
        starts_at=_STARTS,
        size_cap=40,
        status="scheduled",
        channel_id="c1",
        created_by_user_id="u0",
        created_by_display_name="Thrall",
        notes=None,
        cancel_reason=None,
        title=None,
    )


def _signup(
    name: str,
    *,
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "tank",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(uuid.uuid4().int)[:18],
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _icons(*logical: str) -> EmojiSet:
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(logical)})


_ALL_ICONS = _icons(*(cls.key for cls in CLASSES), "role_tank", "role_healer", "role_dps")


# ---------------------------------------------------------------------------
# Class + role pickers
# ---------------------------------------------------------------------------


def test_class_picker_options_carry_class_icons() -> None:
    [row] = class_picker_data(_event(), "confirmed", emojis=_ALL_ICONS)["components"]
    [select] = row["components"]
    assert [(option["value"], option["emoji"]["name"]) for option in select["options"]] == [
        (cls.key, f"{cls.key}__a1b2c3") for cls in CLASSES
    ]


def test_class_picker_has_plain_options_before_the_first_sync() -> None:
    [row] = class_picker_data(_event(), "confirmed", emojis=EMPTY_EMOJIS)["components"]
    assert all("emoji" not in option for option in row["components"][0]["options"])


def test_role_buttons_carry_role_icons() -> None:
    [row] = role_picker_data(_event(), "confirmed", "druid", emojis=_ALL_ICONS)["components"]
    assert [(button["label"], button["emoji"]["name"]) for button in row["components"]] == [
        ("Tank", "role_tank__a1b2c3"),
        ("Healer", "role_healer__a1b2c3"),
        ("DPS", "role_dps__a1b2c3"),
    ]
    [row] = role_picker_data(_event(), "confirmed", "druid", emojis=EMPTY_EMOJIS)["components"]
    assert all("emoji" not in button for button in row["components"])


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------


def _roster_description(signups: list[WowRaidSignup], emojis: EmojiSet) -> str:
    [embed] = roster_data(_event(), signups, _guild(), emojis=emojis)["embeds"]
    return embed["description"]


def test_roster_lists_players_with_their_class_icon() -> None:
    signups = [_signup("Alice"), _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=1)]

    description = _roster_description(signups, _ALL_ICONS)

    assert "<:warrior__a1b2c3:1400000000000000000> Alice" in description
    assert f"{_ALL_ICONS.markup('mage')} Maybe" in description


def test_roster_falls_back_to_text_tags_before_the_first_sync() -> None:
    description = _roster_description([_signup("Alice")], EMPTY_EMOJIS)
    assert "[WAR] Alice" in description
    assert "<:" not in description


def test_a_long_roster_is_clipped_at_a_line_break_so_icons_stay_whole() -> None:
    statuses = ["confirmed", "confirmed", "tentative", "late", "bench"]
    signups = [
        _signup(
            f"{i:03d}" + "x" * 29,
            status=statuses[i % len(statuses)],
            wow_class=CLASSES[i % len(CLASSES)].key,
            role=CLASSES[i % len(CLASSES)].roles[-1],
            minute=i,
        )
        for i in range(120)
    ]

    description = _roster_description(signups, _ALL_ICONS)

    assert len(description) <= EMBED_DESCRIPTION_LIMIT
    assert description.endswith("\n…")
    assert description.count("<:") == len(_ICON.findall(description))
    for line in description.splitlines()[:-1]:
        # Every listed player keeps their whole name.
        assert not line.endswith("…")


@pytest.mark.parametrize(
    ("text", "limit", "expected"),
    [
        ("short", 10, "short"),
        ("line one\nline two\nline three", 20, "line one\nline two\n…"),
        ("x" * 12, 10, "x" * 9 + "…"),
    ],
)
def test_clip_lines(text: str, limit: int, expected: str) -> None:
    clipped = _clip_lines(text, limit)
    assert clipped == expected
    assert len(clipped) <= limit
