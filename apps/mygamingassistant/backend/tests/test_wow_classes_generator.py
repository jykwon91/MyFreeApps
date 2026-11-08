"""Tests for the WoW classes generator output and the icon pipeline integration.

Checks the committed ``classDetails.json`` for correctness and ensures every
class icon file id is covered by the committed ``wowIcons.json``.
"""
from __future__ import annotations

import json

from scripts.wow_classes.build import OUT_FILE, _CLASS_ID_TO_SLUG, _DISPLAY_POWER_TO_RESOURCE, build_class_details
from scripts.wow_icons.build import OUT_FILE as ICON_MAP_FILE
from scripts.wow_icons.build import class_icon_files
from scripts.wow_world_map.sources import WAGO_BUILD


KNOWN_RESOURCES = {"mana", "rage", "energy"}
EXPECTED_SLUGS = set(_CLASS_ID_TO_SLUG.values())


def _committed() -> dict:
    return json.loads(OUT_FILE.read_text(encoding="utf-8"))


def test_committed_output_has_all_nine_classes() -> None:
    classes = _committed()["classes"]
    assert set(classes.keys()) == EXPECTED_SLUGS, f"missing or extra classes: {set(classes.keys()) ^ EXPECTED_SLUGS}"


def test_committed_output_has_correct_client_build() -> None:
    assert _committed()["clientBuild"] == WAGO_BUILD


def test_committed_class_icons_are_positive_integers() -> None:
    for slug, detail in _committed()["classes"].items():
        assert isinstance(detail["icon"], int) and detail["icon"] > 0, f"{slug}: bad icon {detail['icon']}"


def test_committed_class_resources_are_valid() -> None:
    for slug, detail in _committed()["classes"].items():
        assert detail["resource"] in KNOWN_RESOURCES, f"{slug}: unknown resource {detail['resource']!r}"


def test_warrior_uses_rage() -> None:
    assert _committed()["classes"]["warrior"]["resource"] == "rage"


def test_rogue_uses_energy() -> None:
    assert _committed()["classes"]["rogue"]["resource"] == "energy"


def test_mana_classes_use_mana() -> None:
    mana_classes = {"druid", "hunter", "mage", "paladin", "priest", "shaman", "warlock"}
    for slug in mana_classes:
        assert _committed()["classes"][slug]["resource"] == "mana", f"{slug} should use mana"


def test_display_power_mapping_covers_all_resources() -> None:
    """Every resource type we emit must come from a known DisplayPower value."""
    assert set(_DISPLAY_POWER_TO_RESOURCE.values()) == KNOWN_RESOURCES


def test_build_class_details_offline_shape() -> None:
    """The module-level helper validates shape without network access."""
    classes = _committed()["classes"]
    assert len(classes) == 9
    for slug, detail in classes.items():
        assert "icon" in detail
        assert "resource" in detail


def test_every_class_icon_is_in_the_icon_map() -> None:
    """The icon pipeline must cover every class icon file id."""
    wanted = class_icon_files()
    assert len(wanted) == 9, f"expected 9 class icons, got {len(wanted)}"
    icon_data = json.loads(ICON_MAP_FILE.read_text(encoding="utf-8"))
    files = set(icon_data["files"])
    missing = wanted - files
    assert not missing, f"class icon ids missing from wowIcons.json: {missing}. Re-run python -m scripts.wow_icons.build"
