"""Pure tests: raid catalog ↔ model constraints, custom_id scheme, timezone
lookup, and the slash-command spec's Discord limits."""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from app.models.wow.wow_raid_event import RAID_KEYS
from app.models.wow.wow_raid_signup import RAID_ROLES, WOW_CLASSES, WOW_SPECS
from app.services.discord.commands_spec import ALL_COMMANDS, RAID_ADMIN_COMMAND, RAID_COMMAND
from app.services.discord.components.raid import _HANDLERS
from app.services.wow import raid_custom_id, raid_timezones
from app.services.wow.raid_catalog import (
    _LEGACY_SPECS,
    CLASSES,
    RAIDS,
    ROLE_ORDER,
    SPECS,
    class_can_fill,
    effective_spec,
    find_specs,
    search_specs,
    signup_label,
    spec_info,
    spec_list_text,
)
from app.services.wow.raid_custom_id import MAX_CUSTOM_ID_LEN, RELEASE_STATUSES, REQUESTABLE_STATUSES
from app.services.wow.raid_roster import SEAT_STATUSES

_EVENT = uuid.UUID("ffffffff-ffff-4fff-bfff-ffffffffffff")
_CLASSES_TS = Path(__file__).resolve().parents[2] / "frontend/src/games/wow-forever/data/classes.ts"

# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


def test_catalog_matches_model_check_constraints() -> None:
    assert {raid.key for raid in RAIDS} == set(RAID_KEYS)
    assert {cls.key for cls in CLASSES} == set(WOW_CLASSES)
    assert set(ROLE_ORDER) == set(RAID_ROLES)


def test_every_class_has_valid_roles_and_unique_tags() -> None:
    assert len({cls.tag for cls in CLASSES}) == len(CLASSES)
    for cls in CLASSES:
        assert cls.roles and set(cls.roles) <= set(RAID_ROLES)


def test_class_can_fill() -> None:
    assert class_can_fill("druid", "tank")
    assert not class_can_fill("mage", "healer")
    assert not class_can_fill("necromancer", "dps")


def test_spec_keys_match_the_model_check_constraint() -> None:
    assert {spec.key for spec in SPECS} == set(WOW_SPECS)
    assert max(len(key) for key in WOW_SPECS) <= 20  # String(20)


def test_specs_mirror_the_frontend_class_data() -> None:
    source = _CLASSES_TS.read_text(encoding="utf-8")
    frontend = {
        (class_key, *spec)
        for class_key, block in re.findall(r'id: "([a-z]+)",[^\[]*?specs: \[(.*?)\]', source, re.S)
        for spec in re.findall(r'\{ id: "([a-z-]+)", name: "([^"]+)", role: "([a-z]+)" \}', block)
    }
    assert frontend == {(spec.class_key, spec.key, spec.label, spec.spec_role) for spec in SPECS}


def test_every_pre_spec_class_role_has_a_legacy_spec_that_fills_it() -> None:
    assert set(_LEGACY_SPECS) == {(cls.key, role) for cls in CLASSES for role in cls.roles}
    for (wow_class, role), key in _LEGACY_SPECS.items():
        spec = spec_info(wow_class, key)
        assert spec is not None and spec.raid_role == role


def test_spec_labels() -> None:
    assert signup_label("warrior", "dps", "fury") == "Fury Warrior"
    assert signup_label("druid", "tank", "feral-tank") == "Feral Druid (tank)"
    assert signup_label("warrior", "tank", None) == "Warrior (Tank)"  # signed up before specs
    assert signup_label("mage", "dps", "holy") == "Mage (DPS)"  # a spec of another class is ignored
    assert spec_list_text("mage") == "Arcane, Fire or Frost"
    assert effective_spec("priest", "dps", None) == spec_info("priest", "shadow")


@pytest.mark.parametrize(
    ("text", "wow_class", "expected"),
    [
        ("druid.feral-tank", None, ["druid.feral-tank"]),
        ("Feral (tank)", None, ["druid.feral-tank"]),
        ("feral tank", None, ["druid.feral-tank"]),
        ("FURY", None, ["warrior.fury"]),
        ("Holy Priest", None, ["priest.holy"]),
        ("holy", None, ["paladin.holy", "priest.holy"]),
        ("holy", "paladin", ["paladin.holy"]),
        ("holy", "mage", []),
        ("", None, []),
    ],
)
def test_find_specs(text: str, wow_class: str | None, expected: list[str]) -> None:
    assert [spec.choice_value for spec in find_specs(text, wow_class)] == expected


def test_search_specs_matches_every_typed_word() -> None:
    assert len(search_specs("")) == len(SPECS)
    assert {spec.class_key for spec in search_specs("war")} == {"warrior", "warlock"}
    assert [spec.choice_value for spec in search_specs("resto", "shaman")] == ["shaman.restoration"]
    assert [spec.choice_value for spec in search_specs("tank feral")] == ["druid.feral-tank"]


# ---------------------------------------------------------------------------
# custom_id
# ---------------------------------------------------------------------------


def test_router_covers_every_action() -> None:
    assert set(_HANDLERS) == set(raid_custom_id._EVENT_ACTIONS) | set(raid_custom_id._BARE_ACTIONS)


def test_longest_custom_id_fits() -> None:
    longest = max(
        (
            raid_custom_id.encode("role", _EVENT, status, cls.key, role)
            for status in REQUESTABLE_STATUSES
            for cls in CLASSES
            for role in cls.roles
        ),
        key=len,
    )
    assert len(longest) <= MAX_CUSTOM_ID_LEN
    parsed = raid_custom_id.parse(longest)
    assert parsed is not None and parsed.event_id == _EVENT


def test_round_trip() -> None:
    custom_id = raid_custom_id.encode("role", _EVENT, "tentative", "priest", "healer")
    parsed = raid_custom_id.parse(custom_id)
    assert parsed == raid_custom_id.RaidCustomId("role", _EVENT, ("tentative", "priest", "healer"))
    assert raid_custom_id.parse("raid:v1:testdm") == raid_custom_id.RaidCustomId("testdm", None)
    spec_id = raid_custom_id.encode("spec", _EVENT, "druid", "late")
    assert raid_custom_id.parse(spec_id) == raid_custom_id.RaidCustomId("spec", _EVENT, ("druid", "late"))
    pick_id = raid_custom_id.encode("pickclass", _EVENT, "confirmed")
    assert raid_custom_id.parse(pick_id) == raid_custom_id.RaidCustomId("pickclass", _EVENT, ("confirmed",))
    bench_id = raid_custom_id.encode("status", _EVENT, "bench")
    assert raid_custom_id.parse(bench_id) == raid_custom_id.RaidCustomId("status", _EVENT, ("bench",))
    release_id = raid_custom_id.encode("release", _EVENT, "absence")
    assert raid_custom_id.parse(release_id) == raid_custom_id.RaidCustomId("release", _EVENT, ("absence",))
    stay_id = raid_custom_id.encode("stay", _EVENT)
    assert raid_custom_id.parse(stay_id) == raid_custom_id.RaidCustomId("stay", _EVENT)


def test_a_seat_can_be_given_up_for_every_status_that_holds_none() -> None:
    assert set(RELEASE_STATUSES) == set(REQUESTABLE_STATUSES) - set(SEAT_STATUSES)


def test_decline_buttons_on_old_posts_mean_absence() -> None:
    parsed = raid_custom_id.parse(f"raid:v1:status:{_EVENT}:declined")
    assert parsed == raid_custom_id.RaidCustomId("status", _EVENT, ("absence",))
    assert REQUESTABLE_STATUSES == ("confirmed", "late", "tentative", "bench", "absence")


def test_encode_rejects_overlong() -> None:
    with pytest.raises(ValueError):
        raid_custom_id.encode("role", _EVENT, "x" * 80)


@pytest.mark.parametrize(
    "custom_id",
    [
        None,
        42,
        "",
        "raid:v1:",
        "raid:v2:signup:" + str(_EVENT),
        "other:v1:signup:" + str(_EVENT),
        "raid:v1:signup",
        "raid:v1:signup:not-a-uuid",
        f"raid:v1:signup:{_EVENT}:extra",
        f"raid:v1:status:{_EVENT}",
        f"raid:v1:status:{_EVENT}:queued",  # the bot assigns queued; nobody requests it
        f"raid:v1:status:{_EVENT}:yolo",
        f"raid:v1:role:{_EVENT}:confirmed:mage",
        f"raid:v1:role:{_EVENT}:confirmed:necromancer:dps",
        f"raid:v1:role:{_EVENT}:confirmed:mage:support",
        f"raid:v1:spec:{_EVENT}:mage",
        f"raid:v1:spec:{_EVENT}:necromancer:confirmed",
        f"raid:v1:spec:{_EVENT}:mage:queued",
        f"raid:v1:spec:{_EVENT}:mage:declined",  # only the status button keeps the old name
        f"raid:v1:pickclass:{_EVENT}:yolo",
        f"raid:v1:pickclass:{_EVENT}",
        f"raid:v1:release:{_EVENT}",
        f"raid:v1:release:{_EVENT}:confirmed",  # a seat status keeps the seat
        f"raid:v1:release:{_EVENT}:queued",
        f"raid:v1:stay:{_EVENT}:absence",
        f"raid:v1:explode:{_EVENT}",
        "raid:v1:testdm:extra",
        "raid:v1:signup:" + "a" * 200,
    ],
)
def test_parse_rejects_malformed(custom_id: object) -> None:
    assert raid_custom_id.parse(custom_id) is None


# ---------------------------------------------------------------------------
# Timezones
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("America/New_York", "America/New_York"),
        ("america/new_york", "America/New_York"),
        ("Eastern (US)", "America/New_York"),
        ("EST", "America/New_York"),
        ("pacific", "America/Los_Angeles"),
        ("Europe/London", "Europe/London"),
        ("utc", "UTC"),
        ("", None),
        ("Mars/Olympus", None),
    ],
)
def test_resolve(value: str, expected: str | None) -> None:
    assert raid_timezones.resolve(value) == expected


def test_search_limits_and_aliases_first() -> None:
    empty = raid_timezones.search("")
    assert 0 < len(empty) <= 25
    assert empty[0] == {"name": "Eastern (US) — America/New_York", "value": "America/New_York"}
    assert len(raid_timezones.search("a")) == 25
    chicago = raid_timezones.search("chicago")
    assert chicago[0]["value"] == "America/Chicago"
    assert {"name": "America/Argentina/Buenos_Aires", "value": "America/Argentina/Buenos_Aires"} in (
        raid_timezones.search("buenos aires")
    )
    for choice in raid_timezones.search("e"):
        assert len(choice["name"]) <= 100 and len(choice["value"]) <= 100


# ---------------------------------------------------------------------------
# Command spec
# ---------------------------------------------------------------------------


def _walk_options(options: list[dict]) -> list[dict]:
    found: list[dict] = []
    for option in options:
        found.append(option)
        found.extend(_walk_options(option.get("options", [])))
    return found


@pytest.mark.parametrize("command", ALL_COMMANDS, ids=lambda c: c["name"])
def test_command_spec_respects_discord_limits(command: dict) -> None:
    assert 1 <= len(command["name"]) <= 32 and command["name"] == command["name"].lower()
    assert 1 <= len(command["description"]) <= 100
    assert command["dm_permission"] is False and command["contexts"] == [0]
    assert len(command["options"]) <= 25
    for option in _walk_options(command["options"]):
        assert 1 <= len(option["name"]) <= 32 and option["name"] == option["name"].lower()
        assert 1 <= len(option["description"]) <= 100
        choices = option.get("choices", [])
        assert len(choices) <= 25
        for choice in choices:
            assert 1 <= len(choice["name"]) <= 100
        assert not (choices and option.get("autocomplete")), "choices and autocomplete are exclusive"


def test_command_split() -> None:
    assert [c["name"] for c in ALL_COMMANDS] == ["raid", "raid-admin"]
    assert "default_member_permissions" not in RAID_COMMAND
    assert RAID_ADMIN_COMMAND["default_member_permissions"] == str(1 << 33)
    assert [o["name"] for o in RAID_COMMAND["options"]] == ["ping", "list", "prefs"]
    assert [o["name"] for o in RAID_ADMIN_COMMAND["options"]] == ["setup", "create", "edit", "cancel"]
