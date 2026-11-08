"""The playable races of one client, and how Forever's compare with Classic's (pure).

A race is playable when ``CharBaseInfo`` lets it take at least one class —
the character-creation table, so it lists exactly the race/class pairs the
client offers. Faction is ``ChrRaces.Alliance`` (0 Alliance, 1 Horde) and the
race's mask bit (for skill tables) is ``ChrRaces.PlayableRaceBit``.

Starting zones aren't in any client table (the server places a new
character), so a Classic race's comes from cmangos classic-db's
``playercreateinfo`` (Classic data); a race Classic doesn't have takes a
hand-checked zone from ``UNCONFIRMED_START_ZONES``, shown as Unconfirmed.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from scripts.wow_macros.build import CLASS_MASKS
from scripts.wow_world_map.sql_dump import SqlValue

Row = Mapping[str, str]
SqlRow = Mapping[str, SqlValue]

FACTION_ALLIANCE = "alliance"
FACTION_HORDE = "horde"
_FACTIONS = {0: FACTION_ALLIANCE, 1: FACTION_HORDE}
# ChrClasses id -> our class slug (the class mask bit is 1 << (id - 1)).
CLASS_BY_ID = {bit.bit_length(): slug for slug, bit in CLASS_MASKS.items()}
# A playable race Classic doesn't have -> the World Map zone (UiMap id) it starts in.
# Not in the Forever client files; the World Map's own note says the Skyborne start
# on Zephras Isle (data/worldMap/foreverNotes.ts), so the page tags it Unconfirmed.
UNCONFIRMED_START_ZONES = {
    95: 2521,  # High Order Skyborne -> Zephras Isle
    96: 2521,  # Windshaper Skyborne -> Zephras Isle
}


def _int(value: object) -> int:
    try:
        return int(float(value or 0))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0


@dataclass(frozen=True)
class PlayableRace:
    id: int
    name: str
    faction: str
    bit: int
    order: int


def race_classes(char_base_info: Iterable[Row]) -> dict[int, frozenset[str]]:
    """Race id -> the classes character creation offers it."""
    out: dict[int, set[str]] = {}
    for row in char_base_info:
        class_slug = CLASS_BY_ID.get(_int(row["ClassID"]))
        if class_slug is not None:
            out.setdefault(_int(row["RaceID"]), set()).add(class_slug)
    return {race: frozenset(classes) for race, classes in out.items()}


def playable_races(chr_races: Iterable[Row], classes: Mapping[int, frozenset[str]]) -> dict[int, PlayableRace]:
    """The races that can take a class, by id."""
    out: dict[int, PlayableRace] = {}
    for row in chr_races:
        race = _int(row["ID"])
        faction = _FACTIONS.get(_int(row["Alliance"]))
        if race not in classes or faction is None:
            continue
        out[race] = PlayableRace(race, row["Name_lang"].strip(), faction, 1 << _int(row["PlayableRaceBit"]), _int(row["UiDisplayOrder"]))
    return out


def race_order(race: PlayableRace, new: bool = False) -> tuple[int, bool, int, int]:
    """Alliance first, then Horde; within a faction the character screen's order, races new in Forever last."""
    return (0 if race.faction == FACTION_ALLIANCE else 1, new, race.order, race.id)


def classic_start_zones(player_create: Iterable[SqlRow]) -> dict[int, int]:
    """Race id -> the AreaTable zone a new Classic character of it starts in (first class listed)."""
    out: dict[int, int] = {}
    for row in player_create:
        out.setdefault(_int(row["race"]), _int(row["zone"]))
    return out


def ui_map_by_name(zones: Iterable[Mapping[str, object]]) -> dict[str, int]:
    """World Map zone name -> its UiMap id (``zones.json``), for a "Show on map" link."""
    return {str(z["name"]): _int(z["id"]) for z in zones if z.get("kind") == "zone"}
