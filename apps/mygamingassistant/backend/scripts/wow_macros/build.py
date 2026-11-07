"""Build the names the Macros page checks every macro against.

    python -m scripts.wow_macros.build

Writes ``frontend/src/games/wow-forever/data/macros/macroNames.json`` from the
Forever client (the build pinned in ``sources.py``):

- ``classes``: for each class, every spell its talent-tree skill lines teach
  (SkillLineAbility; the owner is checked by ``SkillRaceClassInfo.ClassMask``),
  plus its pets' abilities (the Warlock's Imp, Voidwalker, Succubus and
  Felhunter skill lines).
- ``generalSpells``: spells any class has that a macro uses (the wand's Shoot).
- ``items``: every rank of Healthstone, Soulstone and Healing Potion.

The macros are hand-written; a frontend test fails when one names something
missing here. Never hand-edit the JSON; re-run this.

Game data (c) Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

import re
from pathlib import Path

from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = (
    BACKEND_DIR.parent / "frontend" / "src" / "games" / "wow-forever" / "data" / "macros" / "macroNames.json"
)

# The ChrClasses bit each class owns in SkillRaceClassInfo.ClassMask.
CLASS_MASKS = {
    "warrior": 1,
    "paladin": 2,
    "hunter": 4,
    "rogue": 8,
    "priest": 16,
    "shaman": 64,
    "mage": 128,
    "warlock": 256,
    "druid": 1024,
}

# Each class's talent-tree skill lines. Names repeat across classes (two "Holy",
# two "Restoration", two "Protection"), so the owner is checked by class mask too.
CLASS_LINES: dict[str, dict[int, str]] = {
    "druid": {574: "Balance", 134: "Feral Combat", 573: "Restoration"},
    "hunter": {50: "Beast Mastery", 163: "Marksmanship", 51: "Survival"},
    "mage": {237: "Arcane", 8: "Fire", 6: "Frost"},
    "paladin": {594: "Holy", 267: "Protection", 184: "Retribution"},
    "priest": {613: "Discipline", 56: "Holy", 78: "Shadow Magic"},
    "rogue": {253: "Assassination", 38: "Combat", 39: "Subtlety"},
    "shaman": {375: "Elemental Combat", 373: "Enhancement", 374: "Restoration"},
    "warlock": {355: "Affliction", 354: "Demonology", 593: "Destruction"},
    "warrior": {26: "Arms", 256: "Fury", 257: "Protection"},
}

# Pet skill lines whose abilities a class's macros cast (checked by name only:
# pet lines aren't owned by the class mask).
PET_LINES: dict[str, dict[int, str]] = {
    "warlock": {188: "Pet - Imp", 204: "Pet - Voidwalker", 205: "Pet - Succubus", 189: "Pet - Felhunter"},
}

# Skills any class has; only the wand's "Shoot" is kept from it.
GENERAL_LINES = {228: "Wands"}
GENERAL_SPELLS = {"Shoot"}

# Every rank of the stones: "Minor Healthstone" ... "Major Healthstone", plus the unprefixed one.
STONE_NAME = re.compile(r"^(?:(?:Minor|Lesser|Greater|Major) )?(?:Healthstone|Soulstone)$")
# Every rank of the healing potion: "Minor Healing Potion" ... "Major Healing Potion", plus the unprefixed one.
POTION_NAME = re.compile(r"^(?:(?:Minor|Lesser|Greater|Superior|Major) )?Healing Potion$")
# Dev-only spells the client keeps in these skill lines.
PLACEHOLDER = re.compile(r"\(DND\)|^\?$")


def check_skill_lines(skill_lines: list[dict[str, str]], expected: dict[int, str]) -> None:
    names = {int(r["ID"]): r["DisplayName_lang"] for r in skill_lines}
    for line_id, name in expected.items():
        if names.get(line_id) != name:
            raise SystemExit(f"SkillLine {line_id} is {names.get(line_id)!r}, expected {name!r}: fix the ids.")


def check_line_owners(race_class_info: list[dict[str, str]]) -> None:
    """Fail loudly if a skill line isn't owned by the class it's listed under."""
    masks: dict[int, int] = {}
    for row in race_class_info:
        masks[int(row["SkillID"])] = masks.get(int(row["SkillID"]), 0) | int(row["ClassMask"])
    for class_id, lines in CLASS_LINES.items():
        for line_id in lines:
            if masks.get(line_id) != CLASS_MASKS[class_id]:
                raise SystemExit(
                    f"SkillLine {line_id} has class mask {masks.get(line_id)!r}, expected {class_id} "
                    f"({CLASS_MASKS[class_id]}): fix the ids."
                )


def spell_names(
    abilities: list[dict[str, str]], spell_name_by_id: dict[str, str], lines: set[int]
) -> list[str]:
    """Sorted, de-duplicated names of the spells these skill lines teach."""
    found = {spell_name_by_id.get(r["Spell"], "").strip() for r in abilities if int(r["SkillLine"]) in lines}
    return sorted(n for n in found if n and not PLACEHOLDER.search(n))


def item_names(items: list[dict[str, str]]) -> list[str]:
    """Every rank of Healthstone, Soulstone and Healing Potion, sorted."""
    names = {r["Display_lang"].strip() for r in items}
    return sorted(n for n in names if STONE_NAME.match(n) or POTION_NAME.match(n))


def class_line_ids(class_id: str) -> set[int]:
    return set(CLASS_LINES[class_id]) | set(PET_LINES.get(class_id, {}))


def main() -> None:
    expected = {k: v for lines in (*CLASS_LINES.values(), *PET_LINES.values()) for k, v in lines.items()}
    check_skill_lines(wago_table("SkillLine"), {**expected, **GENERAL_LINES})
    check_line_owners(wago_table("SkillRaceClassInfo"))
    abilities = wago_table("SkillLineAbility")
    by_id = {r["ID"]: r["Name_lang"] for r in wago_table("SpellName")}
    payload = {
        "source": f"WoW Forever client build {WAGO_BUILD} ({WAGO_BRANCH}) via wago.tools. Game data (c) Blizzard Entertainment.",
        "clientBuild": WAGO_BUILD,
        "classes": {c: spell_names(abilities, by_id, class_line_ids(c)) for c in CLASS_LINES},
        "generalSpells": [n for n in spell_names(abilities, by_id, set(GENERAL_LINES)) if n in GENERAL_SPELLS],
        "items": item_names(wago_table("ItemSparse")),
    }
    write_json(OUT_PATH, payload)
    counts = ", ".join(f"{c} {len(n)}" for c, n in payload["classes"].items())
    print(
        f"wrote {OUT_PATH} ({counts}; {len(payload['generalSpells'])} general, {len(payload['items'])} items)"
    )


if __name__ == "__main__":
    main()
