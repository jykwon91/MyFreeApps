"""Which player faction may use an NPC, from Blizzard's FactionTemplate table.

A creature's ``Faction`` column is a FactionTemplate id. The client decides a
unit's reaction to a player by comparing the two templates: explicit
``Enemies_*`` / ``Friend_*`` faction lists first, then the group bitmasks
(``FactionGroup`` / ``FriendGroup`` / ``EnemyGroup``: 1 = player, 2 = Alliance,
4 = Horde, 8 = monster).

We compare against every playable race's own template so an NPC counts as
usable by a faction only if it is not hostile to ANY of that faction's races.
"""
from __future__ import annotations

from dataclasses import dataclass

# Player race FactionTemplate ids (ChrRaces.FactionID in the 1.12 client).
ALLIANCE_RACE_TEMPLATES = (1, 3, 4, 115)  # Human, Dwarf, Night Elf, Gnome
HORDE_RACE_TEMPLATES = (2, 5, 6, 116)  # Orc, Undead, Tauren, Troll

# Output codes (compact JSON): who can use this NPC.
ALLIANCE = "A"
HORDE = "H"
NEUTRAL = "N"  # usable by both factions (goblin towns, Argent Dawn, ...)


@dataclass(frozen=True)
class FactionTemplate:
    id: int
    faction: int
    faction_group: int
    friend_group: int
    enemy_group: int
    enemies: tuple[int, ...]
    friends: tuple[int, ...]

    @classmethod
    def from_csv_row(cls, row: dict[str, str]) -> "FactionTemplate":
        return cls(
            id=int(row["ID"]),
            faction=int(row["Faction"]),
            faction_group=int(row["FactionGroup"]),
            friend_group=int(row["FriendGroup"]),
            enemy_group=int(row["EnemyGroup"]),
            enemies=tuple(int(row[f"Enemies_{i}"]) for i in range(8) if int(row[f"Enemies_{i}"])),
            friends=tuple(int(row[f"Friend_{i}"]) for i in range(8) if int(row[f"Friend_{i}"])),
        )


def is_hostile(npc: FactionTemplate, player: FactionTemplate) -> bool:
    if player.faction in npc.enemies:
        return True
    if player.faction in npc.friends:
        return False
    return bool(npc.enemy_group & player.faction_group)


def usable_by(
    npc_template_id: int, templates: dict[int, FactionTemplate]
) -> str | None:
    """Return ``A`` / ``H`` / ``N`` — or ``None`` when hostile to everyone."""
    npc = templates.get(npc_template_id)
    if npc is None:
        return None
    alliance_ok = not any(is_hostile(npc, templates[t]) for t in ALLIANCE_RACE_TEMPLATES)
    horde_ok = not any(is_hostile(npc, templates[t]) for t in HORDE_RACE_TEMPLATES)
    if alliance_ok and horde_ok:
        return NEUTRAL
    if alliance_ok:
        return ALLIANCE
    if horde_ok:
        return HORDE
    return None
