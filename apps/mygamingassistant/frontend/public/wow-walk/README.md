# WoW Forever walk graphs

`<mapId>.walk` — where a player can walk on each continent (`0` Eastern
Kingdoms, `1` Kalimdor, and the two Forever islands `2991`, `2997`), used by
the World Map's directions to route walks around water, cliffs and walls and
through buildings, caves and cities, instead of in a straight line.

Generated, not hand-edited, from the World of Warcraft: Forever client
(© Blizzard Entertainment) via the wago.tools export of the pinned build (see
`WAGO_BUILD` in `sources.py`): terrain, buildings (WMO) and solid doodads are
turned into a Recast navmesh (`recast-navigation`), whose polygons are joined
into patches labelled with the room or sub-area they are in (`WMOAreaTable`,
`AreaTable`).

```bash
python -m scripts.wow_world_map.walk 0 1 2991 2997   # from apps/mygamingassistant/backend
```

`python -m scripts.wow_world_map.build` rebuilds them too (skip with
`--no-walk`). The file layout is documented in
`backend/scripts/wow_world_map/walk/export.py`; the files are gzipped, and
the page inflates them in the browser.

**Licensing:** lift positions (`gameobject`) and in-map portal targets
(`areatrigger_teleport`) come from [cmangos classic-db](https://github.com/cmangos/classic-db)
at the commit pinned in `sources.py`, licensed under the GNU General Public
License v3.0 (full text in [`LICENSE`](./LICENSE)). No cmangos code is copied.
