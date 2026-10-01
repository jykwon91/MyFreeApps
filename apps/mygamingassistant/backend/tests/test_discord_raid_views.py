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
from app.services.discord import raid_copy
from app.services.discord.raid_views import (
    EMBED_DESCRIPTION_LIMIT,
    _clip_lines,
    class_picker_data,
    my_signup_data,
    release_confirm_data,
    roster_data,
    spec_picker_data,
)
from app.services.wow.raid_catalog import CLASSES, CLASSES_BY_KEY, spec_info

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
    spec: str | None = None,
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(uuid.uuid4().int)[:18],
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _icons(*logical: str) -> EmojiSet:
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(logical)})


_ALL_ICONS = _icons(*(cls.key for cls in CLASSES), "role_tank", "role_healer", "role_dps")


# ---------------------------------------------------------------------------
# Class + spec pickers
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


def _spec_options(data: dict) -> list[dict]:
    return data["components"][0]["components"][0]["options"]


def test_spec_picker_lists_the_class_specs_with_icons_and_roles() -> None:
    icons = _icons(*(spec.icon for spec in CLASSES_BY_KEY["druid"].specs))
    data = spec_picker_data(_event(), "confirmed", "druid", current=None, emojis=icons)

    select_row, button_row = data["components"]
    assert select_row["components"][0]["custom_id"] == f"raid:v1:spec:{_event().id}:druid:confirmed"
    assert [(o["label"], o["description"], o["emoji"]["name"]) for o in _spec_options(data)] == [
        ("Balance", "Ranged DPS", "druid_balance__a1b2c3"),
        ("Feral (damage)", "Melee DPS", "druid_feral_damage__a1b2c3"),
        ("Feral (tank)", "Tank", "druid_feral_tank__a1b2c3"),
        ("Restoration", "Healer", "druid_restoration__a1b2c3"),
    ]
    assert not any(o.get("default") for o in _spec_options(data))
    [other_class] = button_row["components"]
    assert (other_class["label"], other_class["custom_id"]) == (
        "Different class",
        f"raid:v1:pickclass:{_event().id}:confirmed",
    )
    assert data["content"] == raid_copy.spec_prompt("Druid")


def test_spec_picker_preselects_only_the_current_spec() -> None:
    current = spec_info("druid", "feral-tank")
    data = spec_picker_data(_event(), "late", "druid", current=current, emojis=_ALL_ICONS)
    assert [o["value"] for o in _spec_options(data) if o.get("default")] == ["druid.feral-tank"]
    assert data["content"] == raid_copy.spec_switch_prompt("Feral Druid (tank)")


def test_spec_picker_falls_back_to_the_class_icon_then_plain_options() -> None:
    data = spec_picker_data(_event(), "confirmed", "mage", current=None, emojis=_ALL_ICONS)
    assert {o["emoji"]["name"] for o in _spec_options(data)} == {"mage__a1b2c3"}
    data = spec_picker_data(_event(), "confirmed", "mage", current=None, emojis=EMPTY_EMOJIS)
    assert all("emoji" not in o for o in _spec_options(data))


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------


def _roster_description(signups: list[WowRaidSignup], emojis: EmojiSet) -> str:
    [embed] = roster_data(_event(), signups, _guild(), emojis=emojis)["embeds"]
    return embed["description"]


def test_roster_lists_players_with_their_class_icon() -> None:
    signups = [_signup("Alice"), _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=1)]

    description = _roster_description(signups, _ALL_ICONS)

    assert "<:warrior__a1b2c3:1400000000000000000> `1` Alice" in description
    assert f"{_ALL_ICONS.markup('mage')} Maybe" in description  # tentative: no order number


def test_roster_shows_the_spec_icon_when_the_spec_is_known() -> None:
    icons = _icons("warrior", "druid", "druid_feral_tank")
    signups = [_signup("Bear", wow_class="druid", role="tank", spec="feral-tank"), _signup("Alice", minute=1)]

    description = _roster_description(signups, icons)

    assert f"{icons.markup('druid_feral_tank')} `1` Bear" in description
    assert f"{icons.markup('warrior')} `2` Alice" in description


def test_roster_falls_back_to_text_tags_before_the_first_sync() -> None:
    description = _roster_description([_signup("Alice")], EMPTY_EMOJIS)
    assert "[WAR] `1` Alice" in description
    assert "<:" not in description


def test_roster_sections_order_numbers_and_queue_places() -> None:
    signups = [
        _signup("Tank", minute=0),
        _signup("Slow", status="late", wow_class="druid", role="healer", minute=1),
        _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=2),
        _signup("Second", status="queued", wow_class="rogue", role="dps", minute=9),
        _signup("First", status="queued", wow_class="hunter", role="dps", minute=5),
        _signup("Backup", status="bench", wow_class="warlock", role="dps", minute=3),
        _signup("Away", status="absence", wow_class=None, role=None, minute=4),
    ]

    [embed] = roster_data(_event(), signups, _guild(), emojis=EMPTY_EMOJIS)["embeds"]

    # Seat holders carry their order number; the queue shows each place in it.
    assert embed["description"].split("\n\n") == [
        "**Tanks (1)**\n[WAR] `1` Tank",
        "**Healers (0)**\n—",
        "**DPS (0)**\n—",
        "**Late (1)**\n[DRU] `2` Slow",
        "**Tentative (1)**\n[MAG] Maybe",
        "**Queued (2) · waiting for a seat**\n[HUN] #1 First\n[ROG] #2 Second",
        "**Bench (1) · backups**\n[WLK] Backup",
        "**Absence (1)**\nAway",
    ]
    assert embed["footer"]["text"] == "Confirmed 2/40 (1 late) · Signed up 6"


def test_a_long_roster_is_clipped_at_a_line_break_so_icons_stay_whole() -> None:
    statuses = ["confirmed", "confirmed", "tentative", "late", "bench", "queued"]
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


# ---------------------------------------------------------------------------
# My signup
# ---------------------------------------------------------------------------


def test_my_signup_in_the_queue_shows_the_place_in_line() -> None:
    seat = _signup("Seated")
    first = _signup("First", status="queued", wow_class="rogue", role="dps", minute=5)
    me = _signup("Me", status="queued", wow_class="mage", role="dps", spec="frost", minute=9)
    data = my_signup_data(_event(), me, [seat, first, me])
    assert data["content"] == f"For **Onyxia** you're **#2 in the queue** as Frost Mage.\n{raid_copy.QUEUE_MOVES_UP}"
    assert len(data["components"]) == 1  # [Change class or spec]


def test_my_signup_on_the_bench_says_what_bench_means() -> None:
    me = _signup("Me", status="bench", wow_class="mage", role="dps", spec="frost")
    data = my_signup_data(_event(), me, [me])
    assert data["content"] == f"For **Onyxia** you're **on the bench** as Frost Mage.\n{raid_copy.BENCH_NOTE}"


def test_my_signup_when_tentative_says_it_holds_no_seat() -> None:
    me = _signup("Me", status="tentative", wow_class="mage", role="dps", spec="frost")
    data = my_signup_data(_event(), me, [me])
    assert data["content"] == f"For **Onyxia** you're **tentative** as Frost Mage.\n{raid_copy.TENTATIVE_NOTE}"


def test_my_signup_when_absent_has_no_class_or_button() -> None:
    me = _signup("Me", status="absence", wow_class="mage", role="dps", spec="frost")
    data = my_signup_data(_event(), me, [me])
    assert data["content"] == "For **Onyxia** you're **absent**."
    assert data["components"] == []


# ---------------------------------------------------------------------------
# Seat confirmation
# ---------------------------------------------------------------------------


def test_release_confirm_asks_before_the_seat_goes_to_the_queue() -> None:
    event = _event()
    data = release_confirm_data(event, "absence")

    assert data["content"] == raid_copy.release_prompt("absence")
    assert data["content"].endswith("Mark yourself **absent**?")
    assert data["flags"] == 64  # only the clicking player sees it
    [row] = data["components"]
    assert [(b["label"], b["style"], b["custom_id"]) for b in row["components"]] == [
        ("Yes, free my seat", 4, f"raid:v1:release:{event.id}:absence"),
        ("Keep my seat", 2, f"raid:v1:stay:{event.id}"),
    ]
