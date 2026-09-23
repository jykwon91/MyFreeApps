# Classic seed data (GPL-3.0)

The JSON files in this folder are **derived from [cmangos classic-db](https://github.com/cmangos/classic-db)**
and are licensed under the **GNU General Public License v3.0** (full text in
[`LICENSE`](./LICENSE)), not under the MIT license that covers the rest of
MyFreeApps.

| | |
|---|---|
| Upstream | `cmangos/classic-db`, file `Full_DB/ClassicDB_1_12_1_z2815.sql.gz` |
| Pinned commit | `ec4f596146be6467ea93c57397858e329e2db852` |
| Tables used | `creature` / `gameobject` (spawn positions), `creature_template` / `gameobject_template` (name, title, NPC flags, trainer type/class, faction), `game_event_creature` / `game_event_gameobject` (to drop seasonal spawns), `quest_template` + `creature_questrelation` / `gameobject_questrelation` (who starts which quest), `areatrigger_teleport` (which trigger leads into which dungeon) |
| Transformation | `classicServices.json`: service NPCs only (trainers, flight masters, innkeepers, bankers, auctioneers, stable masters, weapon masters, repair vendors). `classicQuests.json`: quest givers (NPCs and objects) with each quest's title, levels, faction and class. `classicDungeons.json`: dungeon and raid entrances. All world positions converted to Forever zone-map coordinates, plus which faction may use each one |
| Generator | `apps/mygamingassistant/backend/scripts/wow_world_map/` (our own code — no cmangos code is copied) |

Zone bounds and faction reactions used during the conversion come from the
World of Warcraft: Forever client tables (© Blizzard Entertainment), exported by
wago.tools. The build is recorded in each file's `source` block. Dungeon
entrance positions come from the Classic Era client's `AreaTrigger` table
(the Forever client no longer ships them); dungeon levels are Forever's own
(`LFGDungeons` → `ContentTuning`).

These are **Classic (1.12) locations**. WoW Forever keeps Classic's world and
coordinate system and most trainers stand where they always did, but Forever
adds and moves NPCs. The page labels every seeded result "Classic location —
may differ in Forever".

## Regenerating

From `apps/mygamingassistant/backend`:

```bash
python -m scripts.wow_world_map.build
```

Change the pins in `scripts/wow_world_map/sources.py`, re-run, commit the
generator change and the regenerated files together.
