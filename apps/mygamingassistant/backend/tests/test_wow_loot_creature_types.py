import json

from scripts.wow_loot.creature_types import OUT, band_of, creature_type_shares


def _template(entry: str, kind: int, level: int, npc_flags: int = 0) -> dict:
    return {"Entry": entry, "CreatureType": str(kind), "MinLevel": str(level), "NpcFlags": str(npc_flags)}


class TestCreatureTypeShares:
    def test_bands_are_ten_levels_and_fifty_up_is_one(self) -> None:
        assert band_of(9) == 0
        assert band_of(44) == 40
        assert band_of(63) == 50

    def test_counts_spawns_by_type_without_npcs_or_critters(self) -> None:
        templates = [
            _template("1", 7, 42),  # humanoid
            _template("2", 1, 44),  # beast
            _template("3", 7, 45, npc_flags=2),  # quest giver: not a mob
            _template("4", 8, 41),  # critter
        ]
        spawns = [{"id": "1"}, {"id": "1"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "missing"}]
        assert creature_type_shares(spawns, templates) == {40: {"BEAST": 0.25, "HUMANOID": 0.75}}

    def test_committed_shares(self) -> None:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        assert set(data["bands"]) == {"0", "10", "20", "30", "40", "50"}
        for shares in data["bands"].values():
            assert 0.95 <= sum(shares.values()) <= 1.05
            assert 0.2 <= shares["HUMANOID"] <= 0.6
