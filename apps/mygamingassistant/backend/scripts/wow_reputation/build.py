"""Build the character page's reputation groups (``/wow-forever/character``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_reputation.build

Reads Blizzard's Game Data API (``static-forever-us``; needs
``BLIZZARD_CLIENT_ID`` / ``BLIZZARD_CLIENT_SECRET`` in ``backend/.env``), so
Forever's own factions (Powderfuse, Kirin Tor…) land under the right header
without a hand-kept list. Writes ``data/character/reputationGroups.json``:
``build`` and ``groups`` — each header's id, name, side (``alliance`` /
``horde`` / null) and faction ids.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_gear.build import write_json
from scripts.wow_reputation.factions import faction_groups
from scripts.wow_talents.blizzard_api import BlizzardStatic, blizzard_credentials, namespace_build

REPUTATION_GROUPS_FILE = WOW_DATA_DIR / "character" / "reputationGroups.json"


def main() -> None:
    with BlizzardStatic(*blizzard_credentials()) as api:
        index = api.get("/data/wow/reputation-faction/index")
        groups = faction_groups(index, lambda faction_id: api.get(f"/data/wow/reputation-faction/{faction_id}"))
    build = namespace_build(index["_links"]["self"]["href"])
    write_json(REPUTATION_GROUPS_FILE, {"build": build, "groups": groups})
    print(f"wrote {len(groups)} reputation groups (build {build}) to {REPUTATION_GROUPS_FILE}")


if __name__ == "__main__":
    main()
