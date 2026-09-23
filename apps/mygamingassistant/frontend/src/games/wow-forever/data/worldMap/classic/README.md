# Classic seed data (GPL-3.0)

The JSON files in this folder are **derived from [cmangos classic-db](https://github.com/cmangos/classic-db)**
and are licensed under the **GNU General Public License v3.0** (full text in
[`LICENSE`](./LICENSE)), not under the MIT license that covers the rest of
MyFreeApps.

| | |
|---|---|
| Upstream | `cmangos/classic-db`, file `Full_DB/ClassicDB_1_12_1_z2815.sql.gz` |
| Pinned commit | `ec4f596146be6467ea93c57397858e329e2db852` |
| Tables used | `creature` (spawn positions), `creature_template` (name, title, NPC flags, trainer type/class, faction), `game_event_creature` (to drop seasonal spawns) |
| Transformation | kept service NPCs only (trainers, flight masters, innkeepers, bankers, auctioneers, stable masters, weapon masters, repair vendors); converted world positions to Forever zone-map coordinates; added which faction may use each NPC |
| Generator | `apps/mygamingassistant/backend/scripts/wow_world_map/` (our own code — no cmangos code is copied) |

Zone bounds and faction reactions used during the conversion come from the
World of Warcraft: Forever client tables (© Blizzard Entertainment), exported by
wago.tools. The build is recorded in each file's `source` block.

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
