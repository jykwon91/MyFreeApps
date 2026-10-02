"""Static catalog for the raid signup bot — raids, classes, specs, roles.

Single source of truth for display names, default raid sizes, the slash-command
choice order (WoW Forever raids first), class tags, each class's specs and the
role every spec plays.  Keys must match the CHECK-constraint tuples in
``app/models/wow/wow_raid_event.py`` / ``wow_raid_signup.py`` — a unit test
pins that.  Spec ids mirror the frontend's
``src/games/wow-forever/data/classes.ts``.
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

RaidEra = Literal["forever", "classic"]
SpecRole = Literal["tank", "healer", "melee", "ranged", "caster"]


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
class WowSpecInfo:
    class_key: str
    key: str
    label: str
    spec_role: SpecRole

    @property
    def icon(self) -> str:
        """Application-emoji name, e.g. ``druid_feral_tank``."""
        return f"{self.class_key}_{self.key.replace('-', '_')}"

    @property
    def raid_role(self) -> str:
        """The seat role the roster counts: tank, healer or dps."""
        if self.spec_role in ("tank", "healer"):
            return self.spec_role
        return "dps"

    @property
    def display_role(self) -> str:
        """tank, healer, melee or ranged (casters are ranged)."""
        if self.spec_role == "caster":
            return "ranged"
        return self.spec_role

    @property
    def column(self) -> str:
        """The raid-post column it shows in: every tank spec under Tanks, else its class."""
        if self.spec_role == "tank":
            return TANK_COLUMN
        return self.class_key

    @property
    def full_label(self) -> str:
        """'Fury Warrior', 'Feral Druid (tank)'."""
        class_label = CLASSES_BY_KEY[self.class_key].label
        name, _, detail = self.label.partition(" (")
        if detail:
            return f"{name} {class_label} ({detail}"
        return f"{self.label} {class_label}"

    @property
    def choice_value(self) -> str:
        """Select-option / autocomplete value: ``<class>.<spec>``."""
        return f"{self.class_key}.{self.key}"


@dataclass(frozen=True)
class WowClassInfo:
    key: str
    label: str
    tag: str
    specs: tuple[WowSpecInfo, ...]

    @property
    def roles(self) -> tuple[str, ...]:
        """Seat roles this class can fill, in ``ROLE_ORDER``."""
        return tuple(role for role in ROLE_ORDER if any(spec.raid_role == role for spec in self.specs))


def _specs(class_key: str, *specs: tuple[str, str, SpecRole]) -> tuple[WowSpecInfo, ...]:
    return tuple(WowSpecInfo(class_key, key, label, role) for key, label, role in specs)


# Ordered: WoW Forever raids first (as offered in the slash-command picker),
# then the Classic-era list.
RAIDS: Final[tuple[RaidInfo, ...]] = (
    RaidInfo("barrow_deeps", "Barrow Deeps", 10, "forever"),
    RaidInfo("hyjal_summit", "Hyjal Summit", 20, "forever"),
    RaidInfo("onyxia", "Onyxia's Lair", 40, "forever"),
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
# Spec-select option descriptions, by display role.
ROLE_DESCRIPTIONS: Final[dict[str, str]] = {
    "tank": "Tank",
    "healer": "Healer",
    "melee": "Melee DPS",
    "ranged": "Ranged DPS",
}

# Raid-Helper's bar order: the order Classic raid leaders read sign-ups in
# (the raid post's buttons and columns, and every class menu).  Survival
# Hunters are ranged and Discipline Priests heal in Classic; Forever has one
# Feral tree, split here by role.
CLASSES: Final[tuple[WowClassInfo, ...]] = (
    WowClassInfo(
        "warrior",
        "Warrior",
        "WAR",
        _specs(
            "warrior",
            ("arms", "Arms", "melee"),
            ("fury", "Fury", "melee"),
            ("protection", "Protection", "tank"),
        ),
    ),
    WowClassInfo(
        "druid",
        "Druid",
        "DRU",
        _specs(
            "druid",
            ("balance", "Balance", "caster"),
            ("feral-damage", "Feral (damage)", "melee"),
            ("feral-tank", "Feral (tank)", "tank"),
            ("restoration", "Restoration", "healer"),
        ),
    ),
    WowClassInfo(
        "paladin",
        "Paladin",
        "PAL",
        _specs(
            "paladin",
            ("holy", "Holy", "healer"),
            ("protection", "Protection", "tank"),
            ("retribution", "Retribution", "melee"),
        ),
    ),
    WowClassInfo(
        "rogue",
        "Rogue",
        "ROG",
        _specs(
            "rogue",
            ("assassination", "Assassination", "melee"),
            ("combat", "Combat", "melee"),
            ("subtlety", "Subtlety", "melee"),
        ),
    ),
    WowClassInfo(
        "hunter",
        "Hunter",
        "HUN",
        _specs(
            "hunter",
            ("beast-mastery", "Beast Mastery", "ranged"),
            ("marksmanship", "Marksmanship", "ranged"),
            ("survival", "Survival", "ranged"),
        ),
    ),
    WowClassInfo(
        "mage",
        "Mage",
        "MAG",
        _specs(
            "mage",
            ("arcane", "Arcane", "caster"),
            ("fire", "Fire", "caster"),
            ("frost", "Frost", "caster"),
        ),
    ),
    WowClassInfo(
        "warlock",
        "Warlock",
        "WLK",
        _specs(
            "warlock",
            ("affliction", "Affliction", "caster"),
            ("demonology", "Demonology", "caster"),
            ("destruction", "Destruction", "caster"),
        ),
    ),
    WowClassInfo(
        "priest",
        "Priest",
        "PRI",
        _specs(
            "priest",
            ("discipline", "Discipline", "healer"),
            ("holy", "Holy", "healer"),
            ("shadow", "Shadow", "caster"),
        ),
    ),
    WowClassInfo(
        "shaman",
        "Shaman",
        "SHA",
        _specs(
            "shaman",
            ("elemental", "Elemental", "caster"),
            ("enhancement", "Enhancement", "melee"),
            ("restoration", "Restoration", "healer"),
        ),
    ),
)
CLASSES_BY_KEY: Final[dict[str, WowClassInfo]] = {cls.key: cls for cls in CLASSES}
SPECS: Final[tuple[WowSpecInfo, ...]] = tuple(spec for cls in CLASSES for spec in cls.specs)
SPECS_BY_ID: Final[dict[tuple[str, str], WowSpecInfo]] = {(spec.class_key, spec.key): spec for spec in SPECS}

# The raid post groups players into columns: one Tank column for every tank
# spec, then one per class.  Each column has a button with the same count, so
# a player is in exactly one column.
TANK_COLUMN: Final = "tank"
TANK_SPECS: Final[tuple[WowSpecInfo, ...]] = tuple(spec for spec in SPECS if spec.column == TANK_COLUMN)
POST_COLUMNS: Final[tuple[str, ...]] = (TANK_COLUMN, *(cls.key for cls in CLASSES))

# Sign-ups saved before specs existed carry only (class, role).  These Classic
# defaults personalise their reminders; the bot asks for the real spec on the
# player's next button press.
_LEGACY_SPECS: Final[dict[tuple[str, str], str]] = {
    ("warrior", "tank"): "protection",
    ("warrior", "dps"): "fury",
    ("paladin", "tank"): "protection",
    ("paladin", "healer"): "holy",
    ("paladin", "dps"): "retribution",
    ("hunter", "dps"): "marksmanship",
    ("rogue", "dps"): "combat",
    ("priest", "healer"): "holy",
    ("priest", "dps"): "shadow",
    ("shaman", "healer"): "restoration",
    ("shaman", "dps"): "enhancement",
    ("mage", "dps"): "frost",
    ("warlock", "dps"): "destruction",
    ("druid", "tank"): "feral-tank",
    ("druid", "healer"): "restoration",
    ("druid", "dps"): "feral-damage",
}


def column_label(column: str) -> str:
    """'Tanks', or the class name."""
    if column == TANK_COLUMN:
        return "Tanks"
    return CLASSES_BY_KEY[column].label


def column_icon(column: str) -> str:
    """Application-emoji name for a column: the tank role icon, else the class icon."""
    if column == TANK_COLUMN:
        return "role_tank"
    return column


def column_tag(column: str) -> str:
    """Short text tag for a column when its icon isn't uploaded: 'TANK', 'WAR'."""
    if column == TANK_COLUMN:
        return "TANK"
    return CLASSES_BY_KEY[column].tag


def column_specs(column: str) -> tuple[WowSpecInfo, ...]:
    """The specs a column's spec select offers: every tank spec, or the class's specs."""
    if column == TANK_COLUMN:
        return TANK_SPECS
    return CLASSES_BY_KEY[column].specs


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


def spec_info(wow_class: str | None, spec: str | None) -> WowSpecInfo | None:
    """The spec, or None when either half is missing or they don't belong together."""
    if wow_class is None or spec is None:
        return None
    return SPECS_BY_ID.get((wow_class, spec))


def legacy_spec(wow_class: str | None, role: str | None) -> WowSpecInfo | None:
    """The Classic default spec for a (class, role) saved before specs existed."""
    if wow_class is None or role is None:
        return None
    return spec_info(wow_class, _LEGACY_SPECS.get((wow_class, role)))


def effective_spec(wow_class: str | None, role: str | None, spec: str | None) -> WowSpecInfo | None:
    """The player's spec, else the legacy default for their class and role."""
    return spec_info(wow_class, spec) or legacy_spec(wow_class, role)


def saved_spec(saved_specs: Mapping[str, object] | None, wow_class: str | None) -> WowSpecInfo | None:
    """The spec remembered for *wow_class* in a member's ``saved_specs``; junk reads as None."""
    if not saved_specs or wow_class is None:
        return None
    spec = saved_specs.get(wow_class)
    if not isinstance(spec, str):
        return None
    return spec_info(wow_class, spec)


def signup_label(wow_class: str | None, role: str | None, spec: str | None) -> str:
    """'Fury Warrior'; a sign-up from before specs reads 'Warrior (Tank)'."""
    info = spec_info(wow_class, spec)
    if info is not None:
        return info.full_label
    return class_role_label(wow_class, role)


def spec_list_text(wow_class: str) -> str:
    """'Arcane, Fire or Frost'."""
    labels = [spec.label for spec in CLASSES_BY_KEY[wow_class].specs]
    return ", ".join(labels[:-1]) + f" or {labels[-1]}"


def find_specs(text: str, wow_class: str | None = None) -> list[WowSpecInfo]:
    """Specs matching typed text, narrowed to *wow_class* when given.

    Accepts the autocomplete value (``druid.feral-tank``), a spec id or name
    (``fury``, ``Feral (tank)``, ``feral tank``) or a full name
    (``Holy Priest``).  More than one match means the text needs a class.
    """
    needle = _normalise(text)
    if not needle:
        return []
    candidates = SPECS
    if wow_class is not None:
        candidates = CLASSES_BY_KEY[wow_class].specs
    return [spec for spec in candidates if needle in _spellings(spec)]


def search_specs(text: str, wow_class: str | None = None) -> list[WowSpecInfo]:
    """Type-ahead: specs whose names contain every typed word ("war" → Warrior
    and Warlock specs, "feral tank" → Feral (tank)); empty text lists them all."""
    words = _normalise(text).split()
    candidates = SPECS
    if wow_class is not None:
        candidates = CLASSES_BY_KEY[wow_class].specs
    return [spec for spec in candidates if all(word in " ".join(_spellings(spec)) for word in words)]


def _spellings(spec: WowSpecInfo) -> set[str]:
    return {
        _normalise(spec.choice_value),
        _normalise(spec.key),
        _normalise(spec.label),
        _normalise(spec.full_label),
        _normalise(f"{spec.label} {CLASSES_BY_KEY[spec.class_key].label}"),
    }


def _normalise(text: str) -> str:
    return " ".join(re.sub(r"[^a-z]+", " ", text.lower()).split())
