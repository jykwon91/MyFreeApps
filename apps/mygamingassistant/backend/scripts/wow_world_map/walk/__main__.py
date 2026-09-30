"""``python -m scripts.wow_world_map.walk <mapId> ...`` — rebuild only the walk graphs.

Reads the committed ``travel.json`` for the hubs; ``scripts.wow_world_map.build``
runs the same step after writing it.
"""
import json
import sys

from scripts.wow_world_map.build import DATA_DIR, WALK_DIR
from scripts.wow_world_map.walk.build import build_walk

if __name__ == "__main__":
    travel = json.loads((DATA_DIR / "travel.json").read_text(encoding="utf-8"))
    for arg in sys.argv[1:]:
        build_walk(int(arg), travel, WALK_DIR)
