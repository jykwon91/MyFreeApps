# WoW Forever map art

`<uiMapId>.webp` — the in-game world map of each zone, capital city and
continent, as drawn by the World of Warcraft: Forever client. © Blizzard
Entertainment; shown on the free, non-commercial World Map page as fan content.

Generated, not hand-edited: `apps/mygamingassistant/backend/scripts/wow_world_map/`
stitches the client's 256 px map tiles (`UiMapArtTile`, layer 0) into the
1002x668 map the game shows, via the wago.tools file export of the pinned
Forever client build (see `WAGO_BUILD` in `sources.py`).

```bash
python -m scripts.wow_world_map.build   # from apps/mygamingassistant/backend
```

The ids are the client's `UiMap` ids — the same numbers the in-game
`C_Map` API and the `/mga way` addon command use.

Maps covered: the Azeroth world map (`947`), both continents, every zone and
capital, and the islands that hang off the world map (`2521`, `2524`).

`highlight/<uiMapId>.webp` — the client's hover-highlight art
(`UiMapArt.HighlightFileDataID`): a white glow in the shape of the zone (for a
continent, its coastline) that the page tints friendly / hostile / contested
when you hover it on the map above. Zones' highlights are also turned into
the hit-test masks in `src/games/wow-forever/data/worldMap/mapMasks.json`.
Cities and islands ship no highlight art.
