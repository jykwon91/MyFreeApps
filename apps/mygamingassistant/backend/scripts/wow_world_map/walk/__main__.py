"""``python -m scripts.wow_world_map.walk [--interiors] <mapId> ...`` — rebuild only the walk graphs.

A continent's graph reads the committed ``travel.json`` for its hubs; a
dungeon's (any map listed in ``classicInteriors.json``) its entrances and
bosses. ``--interiors`` first rewrites ``classicInteriors.json`` from the
committed ``classicDungeons.json``; with no map ids it then builds every
dungeon. ``scripts.wow_world_map.build`` runs the same steps after writing
those files.
"""
import json
import sys

from scripts.wow_world_map.build import CLASSIC_DIR, DATA_DIR, WALK_DIR, write_interiors
from scripts.wow_world_map.walk.build import build_interior_walk, build_walk

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--interiors" in args:
        args.remove("--interiors")
        dungeons = json.loads((CLASSIC_DIR / "classicDungeons.json").read_text(encoding="utf-8"))
        interiors = write_interiors(dungeons["rows"])
        args = args or list(interiors)
    else:
        interiors = json.loads((CLASSIC_DIR / "classicInteriors.json").read_text(encoding="utf-8"))["instances"]
    travel = json.loads((DATA_DIR / "travel.json").read_text(encoding="utf-8"))
    for arg in args:
        if arg in interiors:
            build_interior_walk(int(arg), interiors[arg], WALK_DIR)
        else:
            build_walk(int(arg), travel, WALK_DIR)
