"""Build the names the Warlock macros page checks its macros against.

    python -m scripts.wow_warlock.build

Writes ``frontend/src/games/wow-forever/data/warlock/warlockNames.json``: every
Warlock spell name (SkillLineAbility for the Affliction, Demonology and
Destruction skill lines), every Warlock pet ability (Imp, Voidwalker, Succubus
and Felhunter skill lines) and the Healthstone / Soulstone item names, the wand ability (Shoot, from the Wands
skill line) and the healing potion item names, all from
the Forever client (the build pinned in ``sources.py``). The macros are
hand-written; a frontend test fails when one names something missing here.
Never hand-edit the JSON; re-run this.

Game data (c) Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

import re
from pathlib import Path

from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = (
    BACKEND_DIR.parent / "frontend" / "src" / "games" / "wow-forever" / "data" / "warlock" / "warlockNames.json"
)

# SkillLine ids, checked against their client names so a renumbering fails loudly.
SPELL_LINES = {355: "Affliction", 354: "Demonology", 593: "Destruction"}
PET_LINES = {188: "Pet - Imp", 204: "Pet - Voidwalker", 205: "Pet - Succubus", 189: "Pet - Felhunter"}

# Skills any class has, not a Warlock line; only the wand's "Shoot" is kept from it.
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


def spell_names(
    abilities: list[dict[str, str]], spell_name_by_id: dict[str, str], lines: set[int]
) -> list[str]:
    """Sorted, de-duplicated names of the spells these skill lines teach."""
    found = {spell_name_by_id.get(r["Spell"], "").strip() for r in abilities if int(r["SkillLine"]) in lines}
    return sorted(n for n in found if n and not PLACEHOLDER.search(n))


def stone_names(items: list[dict[str, str]]) -> list[str]:
    return sorted({r["Display_lang"].strip() for r in items if STONE_NAME.match(r["Display_lang"].strip())})


def potion_names(items: list[dict[str, str]]) -> list[str]:
    return sorted({r["Display_lang"].strip() for r in items if POTION_NAME.match(r["Display_lang"].strip())})


def main() -> None:
    check_skill_lines(wago_table("SkillLine"), {**SPELL_LINES, **PET_LINES, **GENERAL_LINES})
    abilities = wago_table("SkillLineAbility")
    by_id = {r["ID"]: r["Name_lang"] for r in wago_table("SpellName")}
    items = wago_table("ItemSparse")
    payload = {
        "source": f"WoW Forever client build {WAGO_BUILD} ({WAGO_BRANCH}) via wago.tools. Game data (c) Blizzard Entertainment.",
        "clientBuild": WAGO_BUILD,
        "spells": spell_names(abilities, by_id, set(SPELL_LINES)),
        "petSpells": spell_names(abilities, by_id, set(PET_LINES)),
        "generalSpells": [n for n in spell_names(abilities, by_id, set(GENERAL_LINES)) if n in GENERAL_SPELLS],
        "items": stone_names(items),
        "potions": potion_names(items),
    }
    write_json(OUT_PATH, payload)
    print(
        f"wrote {OUT_PATH} ({len(payload['spells'])} spells, {len(payload['petSpells'])} pet, "
        f"{len(payload['generalSpells'])} general, {len(payload['items'])} items, {len(payload['potions'])} potions)"
    )


if __name__ == "__main__":
    main()
