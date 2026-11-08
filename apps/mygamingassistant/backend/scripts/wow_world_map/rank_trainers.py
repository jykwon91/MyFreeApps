"""Who trains each crafting rank-up (Journeyman / Expert / Artisan), from cmangos classic-db.

A Classic trainer's spell list (``npc_trainer``, plus ``npc_trainer_template`` via the
creature's ``TrainerTemplateId``) names the rank spell itself, so the answer is read
straight from the data, not from a trainer's title. Cooking, Fishing and First Aid Expert / Artisan
are books and quests in Classic, so no trainer teaches them and they come out empty.

Output rows are GPL-3.0 (derived from cmangos) — written only to the ``classic/``
data folder that carries its own LICENSE.

    python -m scripts.wow_world_map.rank_trainers    # rewrite from the committed services + zones
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Mapping, Sequence

from scripts.wow_world_map import sources
from scripts.wow_world_map.sql_dump import read_dump

# Rank spells ("Journeyman Tailor", ...) in rank order, from the Classic Era client's SpellName table.
RANK_NAMES = ("Journeyman", "Expert", "Artisan")
RANK_SPELLS: Mapping[str, tuple[int, int, int]] = {
    "tailoring": (3912, 3913, 12181),
    "enchanting": (7415, 7416, 13921),
    "alchemy": (2280, 3465, 11612),
    "blacksmithing": (2021, 3539, 9786),
    "leatherworking": (2154, 3812, 10663),
    "engineering": (4040, 4041, 12657),
    "cooking": (3412, 2552, 18261),
    "fishing": (7734, 7736, 18249),
    "firstaid": (3280, 7924, 10846),
}

COLUMNS = ["npcId", "name", "faction", "zone", "where", "x", "y", "city"]

SERVICE_NPC_ID, SERVICE_NAME, SERVICE_ZONE, SERVICE_SUBZONE = 1, 4, 6, 7
SERVICE_X, SERVICE_Y, SERVICE_FACTION = 8, 9, 11


def area_label(subzone: str, zone_name: str) -> str:
    """The World Map's label: "Goldshire, Elwynn Forest", or just the zone."""
    return f"{subzone}, {zone_name}" if subzone and subzone != zone_name else zone_name


def teachers_by_spell(trainer_rows: Sequence[Mapping[str, object]], templates: Mapping[int, int]) -> dict[int, set[int]]:
    """Rank spell -> creature entries that teach it."""
    rank_spells = {s for spells in RANK_SPELLS.values() for s in spells}
    out: dict[int, set[int]] = defaultdict(set)
    for row in trainer_rows["npc_trainer"]:  # type: ignore[call-overload]
        spell = int(str(row["spell"] or 0))
        if spell in rank_spells:
            out[spell].add(int(str(row["entry"])))
    by_template: dict[int, list[int]] = defaultdict(list)
    for entry, template in templates.items():
        by_template[template].append(entry)
    for row in trainer_rows["npc_trainer_template"]:  # type: ignore[call-overload]
        spell = int(str(row["spell"] or 0))
        if spell in rank_spells:
            out[spell].update(by_template.get(int(str(row["entry"])), []))
    return out


def build_rank_trainers(
    service_rows: Sequence[Sequence[object]],
    zones: Sequence[Mapping[str, object]],
    teachers: Mapping[int, set[int]],
) -> dict[str, dict[str, list[list[object]]]]:
    """profession -> rank -> trainer rows (``COLUMNS``), cities first, then by name."""
    zone_by_id = {int(str(z["id"])): z for z in zones}
    located: dict[int, Sequence[object]] = {}
    for row in service_rows:
        if row[2] == "profession_trainer":
            located.setdefault(int(str(row[SERVICE_NPC_ID])), row)
    result: dict[str, dict[str, list[list[object]]]] = {}
    for profession, spells in RANK_SPELLS.items():
        result[profession] = {}
        for rank, spell in zip(RANK_NAMES, spells):
            rows: list[list[object]] = []
            for npc_id in teachers.get(spell, set()):
                row = located.get(npc_id)
                if row is None:
                    continue
                zone_id = int(str(row[SERVICE_ZONE]))
                zone = zone_by_id[zone_id]
                rows.append([
                    npc_id,
                    row[SERVICE_NAME],
                    row[SERVICE_FACTION],
                    zone_id,
                    area_label(str(row[SERVICE_SUBZONE]), str(zone["name"])),
                    row[SERVICE_X],
                    row[SERVICE_Y],
                    1 if zone["kind"] == "city" else 0,
                ])
            rows.sort(key=lambda r: (-int(str(r[7])), str(r[2]), str(r[1])))
            result[profession][rank] = rows
    return result


def load_rank_trainers(
    service_rows: Sequence[Sequence[object]], zones: Sequence[Mapping[str, object]]
) -> dict[str, dict[str, list[list[object]]]]:
    tables = read_dump(
        sources.cmangos_dump(), {"npc_trainer", "npc_trainer_template", "creature_template"}
    )
    templates = {
        int(str(r["Entry"])): int(str(r["TrainerTemplateId"] or 0)) for r in tables["creature_template"]
    }
    return build_rank_trainers(service_rows, zones, teachers_by_spell(tables, templates))  # type: ignore[arg-type]


def payload(
    service_rows: Sequence[Sequence[object]],
    zones: Sequence[Mapping[str, object]],
    source: Mapping[str, object],
) -> dict[str, object]:
    return {
        "source": source,
        "ranks": ["Journeyman", "Expert", "Artisan"],
        "columns": COLUMNS,
        "trainers": load_rank_trainers(service_rows, zones),
    }


if __name__ == "__main__":
    from scripts.wow_world_map.build import CLASSIC_DIR, DATA_DIR, classic_source, write_json

    services = json.loads((CLASSIC_DIR / "classicServices.json").read_text(encoding="utf-8"))
    zone_doc = json.loads((DATA_DIR / "zones.json").read_text(encoding="utf-8"))
    write_json(
        CLASSIC_DIR / "classicRankTrainers.json",
        payload(services["rows"], zone_doc["zones"], classic_source("SpellName (rank spells)")),
    )
    print("wrote classicRankTrainers.json")
