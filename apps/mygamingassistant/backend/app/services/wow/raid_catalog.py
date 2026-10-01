"""Static catalog for the raid signup bot — raids, classes, roles.

Single source of truth for display names, default raid sizes, the slash-command
choice order (WoW Forever raids first), class tags and which roles each class
can fill.  Keys must match the CHECK-constraint tuples in
``app/models/wow/wow_raid_event.py`` / ``wow_raid_signup.py`` — a unit test
pins that.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

RaidEra = Literal["forever", "classic"]


@dataclass(frozen=True)
class RaidInfo:
    key: str
    name: str
    default_size: int
    era: RaidEra

    @property
    def choice_label(self) -> str:
        """Label in the /raid-admin create ``raid`` choice list."""
        if self.era == "forever":
            return f"{self.name} ({self.default_size})"
        return f"{self.name} (Classic)"


@dataclass(frozen=True)
class WowClassInfo:
    key: str
    label: str
    tag: str
    roles: tuple[str, ...]


# Ordered: WoW Forever raids first (as offered in the slash-command picker),
# then the Classic-era list.
RAIDS: Final[tuple[RaidInfo, ...]] = (
    RaidInfo("barrow_deeps", "Barrow Deeps", 10, "forever"),
    RaidInfo("hyjal_summit", "Hyjal Summit", 20, "forever"),
    RaidInfo("onyxia", "Onyxia", 40, "forever"),
    RaidInfo("mc", "Molten Core", 40, "classic"),
    RaidInfo("bwl", "Blackwing Lair", 40, "classic"),
    RaidInfo("zg", "Zul'Gurub", 20, "classic"),
    RaidInfo("aq20", "Ruins of Ahn'Qiraj", 20, "classic"),
    RaidInfo("aq40", "Temple of Ahn'Qiraj", 40, "classic"),
    RaidInfo("naxx", "Naxxramas", 40, "classic"),
)
RAIDS_BY_KEY: Final[dict[str, RaidInfo]] = {raid.key: raid for raid in RAIDS}

ROLE_ORDER: Final[tuple[str, ...]] = ("tank", "healer", "dps")
ROLE_LABELS: Final[dict[str, str]] = {"tank": "Tank", "healer": "Healer", "dps": "DPS"}
ROLE_FIELD_LABELS: Final[dict[str, str]] = {"tank": "Tanks", "healer": "Healers", "dps": "DPS"}

CLASSES: Final[tuple[WowClassInfo, ...]] = (
    WowClassInfo("warrior", "Warrior", "WAR", ("tank", "dps")),
    WowClassInfo("paladin", "Paladin", "PAL", ("tank", "healer", "dps")),
    WowClassInfo("hunter", "Hunter", "HUN", ("dps",)),
    WowClassInfo("rogue", "Rogue", "ROG", ("dps",)),
    WowClassInfo("priest", "Priest", "PRI", ("healer", "dps")),
    WowClassInfo("shaman", "Shaman", "SHA", ("healer", "dps")),
    WowClassInfo("mage", "Mage", "MAG", ("dps",)),
    WowClassInfo("warlock", "Warlock", "WLK", ("dps",)),
    WowClassInfo("druid", "Druid", "DRU", ("tank", "healer", "dps")),
)
CLASSES_BY_KEY: Final[dict[str, WowClassInfo]] = {cls.key: cls for cls in CLASSES}


def raid_name(raid_key: str) -> str:
    """Display name for a raid key; falls back to the key for unknown values."""
    info = RAIDS_BY_KEY.get(raid_key)
    if info is None:
        return raid_key
    return info.name


def class_can_fill(wow_class: str, role: str) -> bool:
    info = CLASSES_BY_KEY.get(wow_class)
    return info is not None and role in info.roles


def class_role_label(wow_class: str | None, role: str | None) -> str:
    """'Priest (Healer)' — degrades gracefully when either half is missing."""
    class_label = ""
    if wow_class in CLASSES_BY_KEY:
        class_label = CLASSES_BY_KEY[wow_class].label
    role_label = ROLE_LABELS.get(role or "", "")
    if class_label and role_label:
        return f"{class_label} ({role_label})"
    return class_label or role_label or "no class picked"
