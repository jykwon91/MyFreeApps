"""Unit tests for app.services.discord.raid_leader_views — the right-click menu's cards.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_copy
from app.services.discord.raid_leader_views import PING_MAX_CHARS, closed_card, ping_modal, signed_data
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_RAID_LINE = f"**Onyxia's Lair** · <t:{_STAMP}:F>"
_PING = ("Ping signed members", 1, f"raid:v1:lc:{_EVENT_ID}:ping")


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
        event_id=_EVENT_ID,
        discord_user_id=str(10_000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _buttons(data: dict) -> list[tuple[str, int, str]]:
    return [(b["label"], b["style"], b["custom_id"]) for row in data["components"] for b in row["components"]]


# ---------------------------------------------------------------------------
# Raid: Close / Raid: Open
# ---------------------------------------------------------------------------


def test_the_card_names_the_raid_and_offers_the_opposite() -> None:
    closed = closed_card(_event(closed_at=_T0), raid_copy.CLOSED_OK)
    assert closed["content"] == f"{_RAID_LINE}\n{raid_copy.CLOSED_OK}"
    assert closed["flags"] == 64 and closed["embeds"] == []
    assert _buttons(closed) == [("Reopen sign-ups", 2, f"raid:v1:lc:{_EVENT_ID}:reopen")]

    opened = closed_card(_event(), raid_copy.OPENED_OK)
    assert _buttons(opened) == [("Close sign-ups", 2, f"raid:v1:lc:{_EVENT_ID}:close")]


def test_a_custom_title_is_escaped_on_the_card() -> None:
    data = closed_card(_event(title="Ony *speedrun*"), raid_copy.ALREADY_OPEN)
    assert data["content"].split("\n")[0] == rf"**Ony \*speedrun\*** · <t:{_STAMP}:F>"


# ---------------------------------------------------------------------------
# Raid: Signed
# ---------------------------------------------------------------------------


def _roster() -> list[WowRaidSignup]:
    return [
        _signup("Alice", minute=1),  # a pre-spec warrior tank: Protection
        _signup("Bear", wow_class="druid", spec="feral-tank", minute=2),
        _signup("Fury", role="dps", spec="fury", status="late", minute=3),
        _signup("Cleo", wow_class="priest", role="healer", spec="holy", minute=4),
        _signup("Finn", wow_class="hunter", role="dps", spec="marksmanship", status="queued", minute=5),
        _signup("Bob", wow_class="mage", role="dps", spec="frost", status="tentative", minute=6),
        _signup("Eve", wow_class="rogue", role="dps", spec="combat", status="bench", minute=7),
        _signup("Dan", wow_class=None, role=None, status="absence", minute=8),
    ]


def test_signed_lists_everyone_column_by_column_then_the_lists() -> None:
    data = signed_data(_event(), _roster(), emojis=EMPTY_EMOJIS)
    [embed] = data["embeds"]
    assert embed["title"] == "Signed up (4/40)"  # seats: the confirmed and the late
    assert embed["description"].split("\n\n") == [
        _RAID_LINE,
        "**Tanks (2)**\nAlice (Protection Warrior), Bear (Feral Druid)",
        "**Warrior (1)**\nFury (Fury, late)",
        "**Hunter (1)**\nFinn (Marksmanship, queued)",
        "**Priest (1)**\nCleo (Holy)",
        "**Tentative (1)**\nBob (Frost Mage)",
        "**Bench (1) · backups**\nEve (Combat Rogue)",
        "**Absence (1)**\nDan",
    ]
    assert embed["color"] == COLOR_OPEN
    assert embed["footer"] == {"text": "Raid ID a1b2c3"}
    assert data["content"] == "" and data["flags"] == 64
    assert _buttons(data) == [_PING]


def test_signed_once_closed_says_so_and_puts_a_notice_on_top() -> None:
    data = signed_data(_event(closed_at=_T0), _roster(), emojis=EMPTY_EMOJIS, notice=raid_copy.PING_WAIT)
    [embed] = data["embeds"]
    assert embed["description"].split("\n\n")[0] == f"{_RAID_LINE}\n**Sign-ups are closed.**"
    assert embed["color"] == COLOR_CLOSED
    assert data["content"] == raid_copy.PING_WAIT
    assert _buttons(data) == [_PING]  # a closed raid can still be pinged


def test_nobody_to_ping_means_no_ping_button() -> None:
    empty = signed_data(_event(), [], emojis=EMPTY_EMOJIS)
    assert empty["embeds"][0]["title"] == "Signed up (0/40)"
    assert empty["embeds"][0]["description"] == f"{_RAID_LINE}\n\n{raid_copy.NOBODY_SIGNED_UP}"
    assert empty["components"] == []

    away = signed_data(_event(), [_signup("Dan", status="absence")], emojis=EMPTY_EMOJIS)
    assert away["components"] == []  # an absence isn't pinged

    cancelled = signed_data(_event(status="cancelled"), _roster(), emojis=EMPTY_EMOJIS)
    assert cancelled["components"] == []
    assert cancelled["embeds"][0]["color"] == COLOR_CLOSED


def test_a_huge_roster_is_clipped_to_fit_the_embed() -> None:
    signups = [
        _signup(f"*Long_Name_{i:03}*" * 3, wow_class="mage", role="dps", spec="frost", status=status, minute=i)
        for i, status in enumerate(["confirmed"] * 40 + ["queued"] * 60 + ["tentative"] * 60 + ["bench"] * 60)
    ]
    description = signed_data(_event(), signups, emojis=EMPTY_EMOJIS)["embeds"][0]["description"]
    assert len(description) <= EMBED_DESCRIPTION_LIMIT
    assert description.endswith("…")


# ---------------------------------------------------------------------------
# The ping form
# ---------------------------------------------------------------------------


def test_ping_form_is_prefilled_with_a_reminder() -> None:
    modal = ping_modal(_event())
    assert modal["type"] == 9
    data = modal["data"]
    assert data["custom_id"] == f"raid:v1:m:{_EVENT_ID}:ping"
    assert data["title"] == raid_copy.PING_MODAL_TITLE and len(data["title"]) <= 45
    [field] = data["components"]
    assert field["type"] == 18
    assert field["label"] == raid_copy.PING_FIELD_LABEL and len(field["label"]) <= 45
    assert len(field["description"]) <= 100
    assert field["component"] == {
        "type": 4,
        "custom_id": "message",
        "style": 2,
        "min_length": 1,
        "max_length": PING_MAX_CHARS,
        "required": True,
        "value": raid_copy.ping_prefill("Onyxia's Lair"),
    }
