"""Build the per-class spell names the Guide's ready-made macros are checked against.

    python -m scripts.wow_class_spells.build

Writes ``frontend/src/games/wow-forever/data/guide/classSpellNames.json``: for
each class, every spell its talent-tree skill lines teach (SkillLineAbility),
from the Forever client (the build pinned in ``sources.py``). The macros are
hand-written; a frontend test fails when one casts a spell its class doesn't
have here. Never hand-edit the JSON; re-run this.

Game data (c) Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

from pathlib import Path

from scripts.wow_warlock.build import check_skill_lines, spell_names
from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = (
    BACKEND_DIR.parent / "frontend" / "src" / "games" / "wow-forever" / "data" / "guide" / "classSpellNames.json"
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


def main() -> None:
    check_skill_lines(wago_table("SkillLine"), {k: v for lines in CLASS_LINES.values() for k, v in lines.items()})
    check_line_owners(wago_table("SkillRaceClassInfo"))
    abilities = wago_table("SkillLineAbility")
    by_id = {r["ID"]: r["Name_lang"] for r in wago_table("SpellName")}
    payload = {
        "source": f"WoW Forever client build {WAGO_BUILD} ({WAGO_BRANCH}) via wago.tools. Game data (c) Blizzard Entertainment.",
        "clientBuild": WAGO_BUILD,
        "classes": {c: spell_names(abilities, by_id, set(lines)) for c, lines in CLASS_LINES.items()},
    }
    write_json(OUT_PATH, payload)
    counts = ", ".join(f"{c} {len(n)}" for c, n in payload["classes"].items())
    print(f"wrote {OUT_PATH} ({counts})")


if __name__ == "__main__":
    main()
