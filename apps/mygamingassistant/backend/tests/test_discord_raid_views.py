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
    preview_data,
    release_confirm_data,
    roster_data,
    spec_picker_data,
)
from app.services.wow.raid_catalog import CLASSES, CLASSES_BY_KEY, spec_info
from app.services.wow.raid_custom_id import SAME_STATUS
from app.services.wow.raid_embed import build_signup_embed
from app.services.wow.raid_post_buttons import build_signup_components

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ICON = re.compile(r"<:[a-z0-9_]+:\d+>")


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": "g1",
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
    }
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
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
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


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


# Class and role icons only — a spec without its own icon shows its class's.
_CLASS_ICONS = _icons(*(cls.key for cls in CLASSES), "role_tank", "role_healer", "role_melee", "role_ranged")


def _buttons(row: dict) -> list[tuple[str, str]]:
    return [(button["label"], button["custom_id"]) for button in row["components"]]


# ---------------------------------------------------------------------------
# Create preview
# ---------------------------------------------------------------------------


def test_preview_is_the_post_with_its_buttons_greyed_out_then_post_and_cancel() -> None:
    event = _event(status="draft")
    guild = _guild(ping_role_id="r9")

    data = preview_data(event, guild, emojis=_CLASS_ICONS)

    assert data["content"] == (
        "**Preview.** This is how the raid will look in <#c1>, pinging <@&r9>. Does this look right?"
    )
    assert data["flags"] == 64  # only the leader sees it
    assert data["embeds"] == [build_signup_embed(event, [], guild, emojis=_CLASS_ICONS)]
    *post_rows, actions = data["components"]
    assert post_rows == build_signup_components(event, [], emojis=_CLASS_ICONS)
    assert all(button["disabled"] for row in post_rows for button in row["components"])
    assert [(b["label"], b["style"], b["custom_id"]) for b in actions["components"]] == [
        ("Post raid", 3, f"raid:v1:confirm:{_EVENT_ID}"),
        ("Cancel", 2, f"raid:v1:discard:{_EVENT_ID}"),
    ]


def test_preview_puts_a_notice_above_the_intro() -> None:
    data = preview_data(_event(status="draft"), _guild(), emojis=EMPTY_EMOJIS, notice="Heads up.")
    assert data["content"] == "Heads up.\n\n**Preview.** This is how the raid will look in <#c1>. Does this look right?"


# ---------------------------------------------------------------------------
# Class + spec selects
# ---------------------------------------------------------------------------


def test_class_picker_offers_tank_then_every_class_with_icons() -> None:
    data = class_picker_data(_event(), "confirmed", emojis=_CLASS_ICONS)

    [row] = data["components"]
    [select] = row["components"]
    assert select["custom_id"] == f"raid:v1:class:{_EVENT_ID}:confirmed"
    tank, *classes = select["options"]
    assert tank == {
        "label": "Tank",
        "value": "tank",
        "description": "Protection Warrior, Feral Druid or Protection Paladin",
        "emoji": {"id": "1400000000000000009", "name": "role_tank__a1b2c3"},
    }
    assert [(option["value"], option["emoji"]["name"]) for option in classes] == [
        (cls.key, f"{cls.key}__a1b2c3") for cls in CLASSES
    ]
    assert data["content"] == raid_copy.CLASS_PROMPT


def test_class_picker_has_plain_options_before_the_first_sync() -> None:
    [row] = class_picker_data(_event(), "confirmed", emojis=EMPTY_EMOJIS)["components"]
    assert all("emoji" not in option for option in row["components"][0]["options"])


def _spec_options(data: dict) -> list[dict]:
    return data["components"][0]["components"][0]["options"]


def test_spec_picker_lists_the_class_specs_with_icons_and_roles() -> None:
    icons = _icons(*(spec.icon for spec in CLASSES_BY_KEY["druid"].specs))
    data = spec_picker_data(_event(), "confirmed", "druid", current=None, emojis=icons)

    select_row, button_row = data["components"]
    assert select_row["components"][0]["custom_id"] == f"raid:v1:spec:{_EVENT_ID}:druid:confirmed"
    assert [(o["label"], o["description"], o["emoji"]["name"]) for o in _spec_options(data)] == [
        ("Balance", "Ranged DPS", "druid_balance__a1b2c3"),
        ("Feral (damage)", "Melee DPS", "druid_feral_damage__a1b2c3"),
        ("Feral (tank)", raid_copy.TANK_SPEC_NOTE, "druid_feral_tank__a1b2c3"),  # it shows under Tanks
        ("Restoration", "Healer", "druid_restoration__a1b2c3"),
    ]
    assert not any(o.get("default") for o in _spec_options(data))
    assert _buttons(button_row) == [("Different class", f"raid:v1:pickclass:{_EVENT_ID}:confirmed")]
    assert data["content"] == raid_copy.spec_prompt("Druid")


def test_tank_spec_picker_offers_every_tank_spec() -> None:
    data = spec_picker_data(_event(), "confirmed", "tank", current=None, emojis=_CLASS_ICONS)

    assert data["components"][0]["components"][0]["custom_id"] == f"raid:v1:spec:{_EVENT_ID}:tank:confirmed"
    assert [(o["label"], o["value"], o["emoji"]["name"]) for o in _spec_options(data)] == [
        ("Protection Warrior", "warrior.protection", "warrior__a1b2c3"),
        ("Feral Druid", "druid.feral-tank", "druid__a1b2c3"),
        ("Protection Paladin", "paladin.protection", "paladin__a1b2c3"),
    ]
    assert not any("description" in o for o in _spec_options(data))  # every option is a tank
    assert data["content"] == raid_copy.TANK_PROMPT


def test_spec_picker_preselects_only_the_current_spec() -> None:
    current = spec_info("druid", "feral-tank")
    data = spec_picker_data(_event(), "late", "druid", current=current, emojis=_CLASS_ICONS)
    assert [o["value"] for o in _spec_options(data) if o.get("default")] == ["druid.feral-tank"]
    assert data["content"] == raid_copy.spec_switch_prompt("Feral Druid (tank)")


def test_spec_picker_from_my_sign_up_keeps_the_status_and_has_back() -> None:
    data = spec_picker_data(
        _event(), SAME_STATUS, "mage", current=spec_info("mage", "frost"), emojis=EMPTY_EMOJIS, back=True
    )
    assert data["components"][0]["components"][0]["custom_id"] == f"raid:v1:spec:{_EVENT_ID}:mage:same"
    assert _buttons(data["components"][1]) == [
        ("Different class", f"raid:v1:pickclass:{_EVENT_ID}:same"),
        ("Back", f"raid:v1:card:{_EVENT_ID}:back"),
    ]


def test_spec_picker_falls_back_to_the_class_icon_then_plain_options() -> None:
    data = spec_picker_data(_event(), "confirmed", "mage", current=None, emojis=_CLASS_ICONS)
    assert {o["emoji"]["name"] for o in _spec_options(data)} == {"mage__a1b2c3"}
    data = spec_picker_data(_event(), "confirmed", "mage", current=None, emojis=EMPTY_EMOJIS)
    assert all("emoji" not in o for o in _spec_options(data))


# ---------------------------------------------------------------------------
# Full roster
# ---------------------------------------------------------------------------


def _roster_description(signups: list[WowRaidSignup], emojis: EmojiSet) -> str:
    [embed] = roster_data(_event(), signups, _guild(), emojis=emojis)["embeds"]
    return embed["description"]


def test_roster_follows_the_post_columns_then_the_lists() -> None:
    signups = [
        _signup("Tank", minute=0),
        _signup("Slow", status="late", wow_class="druid", role="healer", minute=1),
        _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=2),
        _signup("Second", status="queued", wow_class="rogue", role="dps", minute=9),
        _signup("First", status="queued", wow_class="hunter", role="dps", minute=5),
        _signup("Backup", status="bench", wow_class="warlock", role="dps", minute=3),
        _signup("Away", status="absence", wow_class=None, role=None, minute=4),
    ]

    data = roster_data(_event(), signups, _guild(), emojis=EMPTY_EMOJIS)

    [embed] = data["embeds"]
    assert embed["title"] == "Roster — Onyxia's Lair — Sat Oct 10"
    # Seat holders and the queue carry their order number; the queue is struck through.
    assert embed["description"].split("\n\n") == [
        "**Tanks (1)**\n[WAR] `1` **Tank**",
        "**Druid (1)**\n[DRU] `2` **Slow** (late)",
        "**Rogue (1)**\n[ROG] `4` ~~Second~~ (queued)",
        "**Hunter (1)**\n[HUN] `3` ~~First~~ (queued)",
        "**Tentative (1)**\n[MAG] Maybe",
        "**Bench (1) · backups**\n[WLK] Backup",
        "**Absence (1)**\nAway",
    ]
    assert embed["footer"]["text"] == "2/40 confirmed (1 late) · 2 in queue · Signed up 6"
    assert data["content"] == ""
    assert data["components"] == []


def test_roster_shows_spec_icons_and_full_names() -> None:
    icons = _icons("warrior", "druid", "druid_feral_tank", "role_tank", "status_tentative")
    signups = [
        _signup("Bear", wow_class="druid", role="tank", spec="feral-tank"),
        _signup("A" * 32, minute=1),
        _signup("Maybe", status="tentative", minute=2),
    ]

    description = _roster_description(signups, icons)

    assert description.split("\n\n") == [
        "\n".join(
            [
                f"**{icons.markup('role_tank')} Tanks (2)**",
                f"{icons.markup('druid_feral_tank')} `1` **Bear**",
                f"{icons.markup('warrior')} `2` **{'A' * 32}**",  # the post trims names; the roster doesn't
            ]
        ),
        f"**{icons.markup('status_tentative')} Tentative (1)**\n{icons.markup('warrior')} Maybe",
    ]


def test_roster_falls_back_to_text_tags_before_the_first_sync() -> None:
    description = _roster_description([_signup("Alice")], EMPTY_EMOJIS)
    assert description == "**Tanks (1)**\n[WAR] `1` **Alice**"


def test_empty_roster_and_the_back_button() -> None:
    data = roster_data(_event(), [], _guild(), emojis=EMPTY_EMOJIS, back=True)
    assert data["embeds"][0]["description"] == raid_copy.NOBODY_SIGNED_UP
    [row] = data["components"]
    assert _buttons(row) == [("Back", f"raid:v1:card:{_EVENT_ID}:back")]


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

    description = _roster_description(signups, _CLASS_ICONS)

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
# My sign-up card
# ---------------------------------------------------------------------------


_CARD_HEADING = f"**Your sign-up** · Onyxia's Lair · <t:{_STAMP}:F>"
_CHANGE = ("Change spec", f"raid:v1:change:{_EVENT_ID}")
_FULL_ROSTER = ("Full roster", f"raid:v1:card:{_EVENT_ID}:roster")


def test_my_sign_up_in_the_queue_shows_the_place_in_line() -> None:
    seat = _signup("Seated")
    first = _signup("First", status="queued", wow_class="rogue", role="dps", minute=5)
    me = _signup("Me", status="queued", wow_class="mage", role="dps", spec="frost", minute=9)

    data = my_signup_data(_event(), me, [seat, first, me], emojis=EMPTY_EMOJIS)

    assert data["content"].split("\n") == [
        _CARD_HEADING,
        "Status: **#2 in the queue**",
        "Spec: [MAG] **Frost Mage**",
        raid_copy.QUEUE_MOVES_UP,
    ]
    assert data["flags"] == 64
    assert data["embeds"] == []  # a card swapped back from the roster drops the roster embed
    [row] = data["components"]
    assert _buttons(row) == [_CHANGE, _FULL_ROSTER]


def test_my_sign_up_uses_icons_once_uploaded() -> None:
    icons = _icons("status_late", "mage_frost")
    me = _signup("Me", status="late", wow_class="mage", role="dps", spec="frost")
    lines = my_signup_data(_event(), me, [me], emojis=icons)["content"].split("\n")
    assert lines[1:] == [
        f"Status: {icons.markup('status_late')} **Late**",
        f"Spec: {icons.markup('mage_frost')} **Frost Mage**",
    ]


@pytest.mark.parametrize(
    ("status", "status_line", "note"),
    [
        ("confirmed", "Status: **Signed up**", None),
        ("tentative", "Status: **Tentative**", raid_copy.TENTATIVE_NOTE),
        ("bench", "Status: **On the bench**", raid_copy.BENCH_NOTE),
    ],
)
def test_my_sign_up_says_what_each_status_means(status: str, status_line: str, note: str | None) -> None:
    me = _signup("Me", status=status, wow_class="mage", role="dps", spec="frost")
    lines = my_signup_data(_event(), me, [me], emojis=EMPTY_EMOJIS)["content"].split("\n")
    expected = [_CARD_HEADING, status_line, "Spec: [MAG] **Frost Mage**"]
    if note is not None:
        expected.append(note)
    assert lines == expected


def test_my_sign_up_when_absent_has_no_spec_to_change() -> None:
    me = _signup("Me", status="absence", wow_class="mage", role="dps", spec="frost")
    data = my_signup_data(_event(), me, [me], emojis=EMPTY_EMOJIS)
    assert data["content"].split("\n") == [_CARD_HEADING, "Status: **Absent**"]
    [row] = data["components"]
    assert _buttons(row) == [_FULL_ROSTER]


def test_my_sign_up_without_a_class_still_offers_change() -> None:
    me = _signup("Me", wow_class=None, role=None)
    data = my_signup_data(_event(title="Ony *speedrun*"), me, [me], emojis=EMPTY_EMOJIS)
    assert data["content"].split("\n") == [
        rf"**Your sign-up** · Ony \*speedrun\* · <t:{_STAMP}:F>",
        "Status: **Signed up**",
    ]
    [row] = data["components"]
    assert _buttons(row) == [_CHANGE, _FULL_ROSTER]


def test_my_sign_up_when_not_signed_up() -> None:
    data = my_signup_data(_event(), None, [], emojis=EMPTY_EMOJIS)
    assert data["content"] == raid_copy.NOT_SIGNED_UP
    assert data["embeds"] == []
    [row] = data["components"]
    assert _buttons(row) == [_FULL_ROSTER]


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
