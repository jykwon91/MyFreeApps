"""The dungeons the character page marks done / not done, hand-curated.

A dungeon counts as done when Blizzard's "Boss Kills" statistic (category
14821 in the client's Achievement table) for its final boss is above zero.
Blizzard keeps one for a dungeon's last boss only, so a wing whose last boss
has none (Scarlet Monastery Graveyard, Dire Maul East…) is listed with no
statistic ids and shown as not tracked rather than as not done.

``statistic_ids`` with more than one id: the client tracks the same boss
under two ids (Rivendare on 229 and 329); the larger count is the character's.
The build fails if the ids of one row name different bosses.

Scarlet Monastery Cathedral uses Mograine (1093, map 189). Whitemane's
statistic (6786) is tagged map 1001, retail's Scarlet Monastery, which
Forever doesn't run; the two die in one encounter. Lyn the Ignored (63589)
is City of Dalaran's secret boss, and Shaper's Terrace's Cinder / Bolt /
Snowtalon (63590/63592/63593) are hidden sub-encounters — none of them is
the final boss.

Levels: a Classic dungeon takes its Forever level and level to enter from the
World Map's ``classicDungeons.json`` (``instance``). The dungeons Forever
added aren't in that file; their ranges are the published community ones
(Warcraft Tavern's WoW Forever dungeon list, read 2026-11-12) and they have
no level to enter.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CuratedDungeon:
    name: str
    wing: str | None
    # Boss Kills statistic ids; empty when Blizzard keeps none for this dungeon.
    statistic_ids: tuple[int, ...]
    # The World Map instance whose levels it takes (Classic dungeons).
    instance: int | None = None
    # Published level range (Forever's own dungeons).
    levels: tuple[int, int] | None = None
    # Final boss when there is no statistic to name it.
    boss: str | None = None


DUNGEONS: tuple[CuratedDungeon, ...] = (
    CuratedDungeon("Ragefire Chasm", None, (15027,), instance=389),
    CuratedDungeon("Deadmines", None, (63570,), instance=36),
    CuratedDungeon("Wailing Caverns", None, (15028,), instance=43),
    CuratedDungeon("Shadowfang Keep", None, (1092,), instance=33),
    CuratedDungeon("Blackfathom Deeps", None, (6137,), instance=48),
    CuratedDungeon("Stormwind Stockade", None, (15029,), instance=34),
    CuratedDungeon("Razorfen Kraul", None, (6139,), instance=47),
    CuratedDungeon("Gnomeregan", None, (6140,), instance=90),
    CuratedDungeon("Scarlet Monastery", "Graveyard", (), instance=189, boss="Bloodmage Thalnos"),
    CuratedDungeon("Scarlet Monastery", "Library", (), instance=189, boss="Arcanist Doan"),
    CuratedDungeon("Scarlet Monastery", "Armory", (), instance=189, boss="Herod"),
    CuratedDungeon("Scarlet Monastery", "Cathedral", (1093,), instance=189),
    CuratedDungeon("Razorfen Downs", None, (6141,), instance=129),
    CuratedDungeon("Uldaman", None, (6142,), instance=70),
    CuratedDungeon("Maraudon", None, (6143,), instance=349),
    CuratedDungeon("Zul'Farrak", None, (1094,), instance=209),
    CuratedDungeon("Sunken Temple", None, (6144,), instance=109),
    CuratedDungeon("Blackrock Depths", None, (1095,), instance=230),
    CuratedDungeon("Blackrock Spire", "Lower", (6145,), instance=229),
    CuratedDungeon("Blackrock Spire", "Upper", (1096,), instance=229),
    CuratedDungeon("Dire Maul", "East", (), instance=429, boss="Alzzin the Wildshaper"),
    CuratedDungeon("Dire Maul", "West", (), instance=429, boss="Prince Tortheldrin"),
    CuratedDungeon("Dire Maul", "North", (6146,), instance=429),
    CuratedDungeon("Stratholme", "Main gate", (), instance=329, boss="Balnazzar"),
    CuratedDungeon("Stratholme", "Service entrance", (15031, 1097), instance=329),
    CuratedDungeon("Scholomance", None, (15030,), instance=289),
    CuratedDungeon("Hall of Thanes", None, (63573,), levels=(13, 20)),
    CuratedDungeon("Ruins of Lordaeron", None, (63571,), levels=(15, 22)),
    CuratedDungeon("Excavation Site: Wetlands", None, (), levels=(26, 33)),
    CuratedDungeon("City of Dalaran", None, (63572,), levels=(28, 35)),
    CuratedDungeon("The Drowned City", None, (), levels=(35, 42)),
    CuratedDungeon("Krol'Dok Stronghold", None, (), levels=(40, 47)),
    CuratedDungeon("Alcaz Island Prison", None, (63575,), levels=(48, 55)),
    CuratedDungeon("Blackmaw Hold", None, (), levels=(55, 60)),
    CuratedDungeon("Shaper's Terrace", None, (63574,), levels=(58, 60)),
)
