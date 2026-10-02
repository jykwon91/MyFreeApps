"""Unit tests for the raid limits in app.services.discord.raid_views — marked specs and refusals.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_copy, raid_limit_copy
from app.services.discord.raid_views import limit_refusal_data, spec_picker_data
from app.services.wow.raid_catalog import WowSpecInfo, spec_info
from app.services.wow.raid_custom_id import SAME_STATUS
from app.services.wow.raid_limits import LimitCheck, LimitHit, Limits

_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")


def _event() -> WowRaidEvent:
    return WowRaidEvent(
        id=_EVENT_ID,
        guild_id=uuid.uuid4(),
        raid_key="onyxia",
        starts_at=_T0 + timedelta(days=9),
        size_cap=40,
        status="scheduled",
        channel_id="c1",
        created_by_user_id="u0",
    )


def _spec(wow_class: str, spec: str) -> WowSpecInfo:
    info = spec_info(wow_class, spec)
    assert info is not None
    return info


def _player(user: str, wow_class: str, spec: str, *, status: str = "confirmed") -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=user,
        display_name=user,
        status=status,
        wow_class=wow_class,
        role=_spec(wow_class, spec).raid_role,
        spec=spec,
        signed_up_at=_T0,
        updated_at=_T0,
    )


def _check(signups: list[WowRaidSignup], *, roles: dict[str, int] | None = None, classes: dict[str, int] | None = None,
           user: str = "u9", status: str = "confirmed") -> LimitCheck:
    return LimitCheck(Limits(roles=roles or {}, classes=classes or {}), signups, user, status)


def _options(data: dict[str, Any]) -> list[dict[str, Any]]:
    return data["components"][0]["components"][0]["options"]


def _descriptions(data: dict[str, Any]) -> list[tuple[str, str | None]]:
    return [(o["label"], o.get("description")) for o in _options(data)]


# A raid with its one healer seat taken and room for one more Druid.
_HEALER_FULL = [_player("u1", "priest", "holy")]


# ---------------------------------------------------------------------------
# Marks in the spec select
# ---------------------------------------------------------------------------


def test_the_spec_select_marks_the_specs_with_no_room() -> None:
    check = _check(_HEALER_FULL, roles={"healer": 1})
    data = spec_picker_data(_event(), "confirmed", "druid", current=None, emojis=EMPTY_EMOJIS, check=check)
    assert _descriptions(data) == [
        ("Balance", "Ranged DPS"),
        ("Feral (damage)", "Melee DPS"),
        ("Feral (tank)", raid_copy.TANK_SPEC_NOTE),
        ("Restoration", "Healer · full (1/1)"),
    ]
    assert data["content"] == f"{raid_copy.spec_prompt('Druid')}\n{raid_limit_copy.SPEC_MARKS_NOTE}"


def test_no_marks_no_note() -> None:
    data = spec_picker_data(_event(), "confirmed", "mage", current=None, emojis=EMPTY_EMOJIS, check=_check(_HEALER_FULL))
    assert data["content"] == raid_copy.spec_prompt("Mage")
    assert all(not o["description"].endswith(")") for o in _options(data))


def test_marks_under_tank_are_just_the_reason() -> None:
    check = _check([_player("u1", "warrior", "protection")], roles={"tank": 1})
    data = spec_picker_data(_event(), "confirmed", "tank", current=None, emojis=EMPTY_EMOJIS, check=check)
    assert [o.get("description") for o in _options(data)] == ["full (1/1)"] * 3


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


def test_a_spec_with_room_is_not_refused() -> None:
    check = _check(_HEALER_FULL, roles={"healer": 1})
    assert limit_refusal_data(_event(), "confirmed", "druid", check, emojis=EMPTY_EMOJIS) is None
    balance = _spec("druid", "balance")
    assert limit_refusal_data(_event(), "confirmed", "druid", check, emojis=EMPTY_EMOJIS, spec=balance) is None


def test_a_refused_spec_shows_the_spec_select_again_saying_why() -> None:
    check = _check(_HEALER_FULL, roles={"healer": 1})
    resto = _spec("druid", "restoration")
    data = limit_refusal_data(_event(), "confirmed", "druid", check, emojis=EMPTY_EMOJIS, spec=resto, current=resto)
    assert data is not None
    assert data["content"] == (
        "The raid already has all the **healers** it needs (1/1). "
        "Pick another spec, or tap **Tentative** to get on the list."
    )
    assert ("Restoration", "Healer · full (1/1)") in _descriptions(data)
    assert [o["value"] for o in _options(data) if o.get("default")] == ["druid.restoration"]
    assert data["components"][0]["components"][0]["custom_id"] == f"raid:v1:spec:{_EVENT_ID}:druid:confirmed"


def test_a_player_already_on_the_list_is_told_nothing_changed() -> None:
    signups = [*_HEALER_FULL, _player("u9", "druid", "balance", status="tentative")]
    check = _check(signups, roles={"healer": 1})
    resto = _spec("druid", "restoration")
    data = limit_refusal_data(_event(), SAME_STATUS, "druid", check, emojis=EMPTY_EMOJIS, spec=resto)
    assert data is not None
    assert data["content"].endswith(raid_limit_copy.END_LISTED)
    # Opened from My sign-up: [Back] to the card.
    assert [b["label"] for b in data["components"][1]["components"]] == ["Different class", "Back"]


def test_a_closed_column_shows_the_class_select_saying_why() -> None:
    check = _check([_player("u1", "rogue", "combat")], classes={"rogue": 1})
    data = limit_refusal_data(_event(), "late", "rogue", check, emojis=EMPTY_EMOJIS)
    assert data is not None
    assert data["content"] == "**Rogue** is full (1/1). Pick another class, or tap **Tentative** to get on the list."
    [select] = data["components"][0]["components"]
    assert select["custom_id"] == f"raid:v1:class:{_EVENT_ID}:late"
    assert len(data["components"]) == 1  # no [Back]: not opened from My sign-up


def test_a_closed_column_tapped_on_the_post_is_just_why() -> None:
    signups = [_player("u1", "druid", "balance"), _player("u2", "paladin", "protection")]
    check = _check(signups, roles={"tank": 1}, classes={"druid": 1})
    assert check.closed("druid") == [LimitHit("class", "druid", 1, 1), LimitHit("role", "tank", 1, 1)]
    data = limit_refusal_data(_event(), "confirmed", "druid", check, emojis=EMPTY_EMOJIS, tapped=True)
    assert data == {
        "content": "Every **Druid** spec is full right now. Pick another class, or tap **Tentative** to get on the list.",
        "flags": 64,
        "allowed_mentions": {"parse": []},
        "components": [],
    }
