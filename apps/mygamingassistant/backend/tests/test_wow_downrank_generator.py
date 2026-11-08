"""The WoW Forever downrank calculator's generator: Classic's coefficient and penalty rules against known
Classic examples, picking each family's ranks from client rows, the Classic fallback, and the committed
output. Fixtures are synthetic rows, never the network."""
from __future__ import annotations

import json
import math

import pytest

from scripts.wow_downrank.build import CLASSIC_DIR, DOWNRANK_DIR
from scripts.wow_downrank.coefficients import classic_coefficients, full_bonus_until, low_level_factor
from scripts.wow_downrank.families import FAMILIES, KIND_DAMAGE, KIND_HEAL, Family
from scripts.wow_downrank.ranks import (
    FROM_CLASSIC,
    FROM_CLIENT,
    TARGETS_CHAIN,
    TARGETS_GROUP,
    TARGETS_SINGLE,
    ClientSpells,
    Direct,
    Rank,
    classic_rank,
    client_rank,
    family_spells,
    pick_client_rank,
    rank_docs,
    rank_number,
)
from scripts.wow_icons.build import OUT_FILE as ICON_MAP_FILE
from scripts.wow_icons.build import downrank_icon_files
from scripts.wow_world_map.sources import WAGO_BUILD

HEAL = Family("priest", "Heal", KIND_HEAL)

# --- Classic's rules against known Classic numbers ---------------------------


@pytest.mark.parametrize(
    ("cast_ms", "expected"),
    [
        (3000, 0.857),  # Heal / Greater Heal: 3 / 3.5
        (1500, 0.429),  # Lesser Heal Rank 1, Flash Heal: 1.5 / 3.5
        (2500, 0.714),  # Lesser Heal Rank 3, Chain Heal
        (3500, 1.0),  # Healing Touch Rank 11, Fireball Rank 12: the 3.5 sec cap
        (5000, 1.0),  # longer casts still get the whole bonus, never more
        (0, 0.429),  # an instant direct spell counts as 1.5 sec
    ],
)
def test_direct_coefficient_is_cast_time_over_three_and_a_half(cast_ms: int, expected: float) -> None:
    got = classic_coefficients(cast_ms, 0, direct=True, over_time=False)
    assert got.direct == pytest.approx(expected, abs=5e-4)
    assert got.over_time == 0


def test_over_time_coefficient_is_duration_over_fifteen() -> None:
    renew = classic_coefficients(0, 15000, direct=False, over_time=True)
    assert renew.over_time == pytest.approx(1.0)  # 0.2 a tick, 5 ticks — Forever's client says 0.2
    rejuvenation = classic_coefficients(0, 12000, direct=False, over_time=True)
    assert rejuvenation.over_time == pytest.approx(0.8)  # Forever: 0.2 a tick, 4 ticks


def test_hybrid_splits_by_the_portion_over_time() -> None:
    # Regrowth: 2 sec cast, 21 sec heal over time. Portion over time = 1.4 / (1.4 + 0.5714).
    got = classic_coefficients(2000, 21000, direct=True, over_time=True)
    portion = 1.4 / (1.4 + 2 / 3.5)
    assert got.direct == pytest.approx(2 / 3.5 * (1 - portion))
    assert got.over_time == pytest.approx(1.4 * portion)


def test_slows_cost_five_percent_and_area_spells_get_half() -> None:
    frostbolt = classic_coefficients(3000, 0, direct=True, over_time=False, extra_effects=1)
    assert frostbolt.direct == pytest.approx(0.814, abs=5e-4)  # Forever's client: 0.814
    area = classic_coefficients(3000, 0, direct=True, over_time=False, area=True)
    assert area.direct == pytest.approx(0.857 / 2, abs=5e-4)


@pytest.mark.parametrize(
    ("level", "factor"),
    [(1, 0.2875), (4, 0.4), (10, 0.625), (16, 0.85), (19, 0.9625), (20, 1.0), (60, 1.0)],
)
def test_below_level_20_penalty(level: int, factor: float) -> None:
    assert low_level_factor(level) == pytest.approx(factor)


def test_downrank_penalty_starts_five_levels_past_max_level() -> None:
    assert full_bonus_until(21) == 26  # Heal Rank 1
    assert full_bonus_until(45) == 50  # Greater Heal Rank 1
    assert full_bonus_until(None) is None
    assert full_bonus_until(0) is None


def test_known_example_heal_rank_1_at_60() -> None:
    # Heal Rank 1 at 60: 0.857 x (learned at 16: 0.85) x (21 + 5) / 60 = ~0.3157 of your +healing.
    until = full_bonus_until(21)
    assert until is not None
    assert 0.857 * low_level_factor(16) * until / 60 == pytest.approx(0.3157, abs=1e-4)


# --- ranks from client rows --------------------------------------------------


def _ability(spell: int, line: int = 56, acquire: int = 0) -> dict[str, str]:
    return {"Spell": str(spell), "SkillLine": str(line), "AcquireMethod": str(acquire)}


def test_rank_number_reads_rank_subtexts_only() -> None:
    assert rank_number("Rank 3") == 3
    assert rank_number("") is None
    assert rank_number("Rank 3 (Rune)") is None


def test_family_spells_groups_by_rank_and_prefers_the_trainer_copy() -> None:
    names = {1: "Heal", 2: "Heal", 3: "Heal", 4: "Heal", 5: "Greater Heal", 6: "Heal"}
    subtexts = {1: "Rank 1", 2: "Rank 1", 3: "Rank 2", 4: "", 5: "Rank 1", 6: "Rank 3"}
    abilities = [
        _ability(1), _ability(2, acquire=3), _ability(3), _ability(4), _ability(5),
        _ability(6, acquire=3), _ability(1, line=999),
    ]
    got = family_spells(HEAL, abilities, [56], names, subtexts)
    # Rank 1's rune copy drops; rankless and other-name spells drop; Rank 3 only has the other copy.
    assert got == {1: [1], 2: [3], 3: [6]}


def _effect(spell: int, effect: int, index: int = 0, **extra: str) -> dict[str, str]:
    row = {
        "SpellID": str(spell), "EffectIndex": str(index), "DifficultyID": "0", "Effect": str(effect),
        "EffectAura": "0", "EffectBasePointsF": "0", "EffectRealPointsPerLevel": "0", "Variance": "0",
        "EffectBonusCoefficient": "0", "EffectAuraPeriod": "0", "ImplicitTarget_0": "21", "EffectChainTargets": "0",
    }
    row.update(extra)
    return row


def _spells(*, effects: list[dict[str, str]], spell: int = 2054, mana: str = "155", cast_index: str = "14",
            duration_index: str = "0", level: str = "16", max_level: str = "21") -> ClientSpells:
    return ClientSpells.from_tables({
        "SpellName": [{"ID": str(spell), "Name_lang": "Heal"}],
        "Spell": [{"ID": str(spell), "NameSubtext_lang": "Rank 1"}],
        "SpellLevels": [{"SpellID": str(spell), "DifficultyID": "0", "SpellLevel": level, "MaxLevel": max_level}],
        "SpellPower": [{"SpellID": str(spell), "PowerType": "0", "OrderIndex": "0", "ManaCost": mana}],
        "SpellCastTimes": [{"ID": "14", "Base": "3000"}, {"ID": "1", "Base": "0"}],
        "SpellDuration": [{"ID": "8", "Duration": "15000"}],
        "SpellMisc": [{
            "SpellID": str(spell), "DifficultyID": "0", "CastingTimeIndex": cast_index,
            "DurationIndex": duration_index, "SpellIconFileDataID": "135916",
        }],
        "SpellEffect": effects,
    })


def test_client_rank_reads_a_direct_heal() -> None:
    spells = _spells(effects=[_effect(
        2054, 10, EffectBasePointsF="270", EffectRealPointsPerLevel="2", Variance="0.1447",
        EffectBonusCoefficient="0.857",
    )])
    rank = client_rank(spells, 2054, 1, KIND_HEAL)
    assert rank == Rank(
        2054, 1, 16, 21, 155, 3000, Direct(270, 2, 0.1447, 0.857), None, FROM_CLIENT, FROM_CLIENT, TARGETS_SINGLE,
    )
    assert spells.icons[2054] == 135916


def test_client_rank_reads_a_heal_over_time_per_tick() -> None:
    spells = _spells(
        cast_index="1", duration_index="8",
        effects=[_effect(139, 6, EffectAura="8", EffectBasePointsF="9", EffectAuraPeriod="3000",
                         EffectBonusCoefficient="0.2")],
        spell=139,
    )
    rank = client_rank(spells, 139, 1, KIND_HEAL)
    assert rank is not None and rank.direct is None and rank.periodic is not None
    assert (rank.periodic.tick, rank.periodic.ticks, rank.periodic.coefficient) == (9, 5, 0.2)
    assert rank.cast_ms == 0


def test_client_rank_ignores_the_other_kind_and_extra_effects() -> None:
    # A heal family never counts a damage effect; a slow is not an amount.
    spells = _spells(effects=[_effect(2054, 2, EffectBasePointsF="100"), _effect(2054, 6, 1, EffectAura="33")])
    assert client_rank(spells, 2054, 1, KIND_HEAL) is None
    damage = client_rank(spells, 2054, 1, KIND_DAMAGE)
    assert damage is not None and damage.direct is not None
    assert damage.direct.coefficient == pytest.approx(0.814, abs=5e-4)  # no client coefficient: the formula, slowed
    assert damage.coefficient_from == "formula"


def test_client_rank_is_none_without_mana_or_level() -> None:
    effects = [_effect(2054, 10, EffectBasePointsF="1", EffectBonusCoefficient="0.7")]
    assert client_rank(_spells(effects=effects, mana="0"), 2054, 1, KIND_HEAL) is None
    assert client_rank(_spells(effects=effects, level="0"), 2054, 1, KIND_HEAL) is None


def test_targets_chain_and_group() -> None:
    chain = _spells(effects=[_effect(2054, 10, ImplicitTarget_0="45", EffectChainTargets="3", EffectBonusCoefficient="0.7")])
    rank = client_rank(chain, 2054, 1, KIND_HEAL)
    assert rank is not None and rank.targets == TARGETS_CHAIN
    no_jumps = _spells(effects=[_effect(2054, 10, ImplicitTarget_0="45", EffectBonusCoefficient="0.7")])
    rank = client_rank(no_jumps, 2054, 1, KIND_HEAL)
    assert rank is not None and rank.targets == TARGETS_SINGLE
    party = _spells(effects=[_effect(2054, 10, ImplicitTarget_0="132", EffectBonusCoefficient="0.286")])
    rank = client_rank(party, 2054, 1, KIND_HEAL)
    assert rank is not None and rank.targets == TARGETS_GROUP


def test_two_complete_copies_of_a_rank_stop_the_run() -> None:
    effects = [
        _effect(2054, 10, EffectBasePointsF="270", EffectBonusCoefficient="0.857"),
        _effect(9999, 10, EffectBasePointsF="270", EffectBonusCoefficient="0.857"),
    ]
    spells = _spells(effects=effects)
    spells = ClientSpells(
        spells.names, spells.subtexts, {**spells.levels, 9999: (16, 21)}, {**spells.mana, 9999: 155},
        {**spells.cast_ms, 9999: 3000}, spells.duration_ms, spells.effects, spells.icons,
    )
    with pytest.raises(SystemExit, match="priest-heal Rank 1"):
        pick_client_rank(spells, HEAL, 1, [2054, 9999])


def test_classic_rank_reads_cmangos_dice_and_per_level() -> None:
    # cmangos Heal Rank 1: 294 + 1d47 = 295 to 341, +2.4 a level.
    row = {
        "Id": 2054, "SpellLevel": 16, "MaxLevel": 21, "ManaCost": 155, "CastingTimeIndex": 14, "DurationIndex": 0,
        "Effect1": 10, "EffectBasePoints1": 294, "EffectBaseDice1": 1, "EffectDieSides1": 47,
        "EffectRealPointsPerLevel1": 2.4, "EffectImplicitTargetA1": 21,
    }
    rank = classic_rank(row, 1, KIND_HEAL, {14: 3000}, {})
    assert rank is not None and rank.direct is not None
    assert rank.source == FROM_CLASSIC
    assert rank.direct.base == 318
    assert rank.direct.base * (1 - rank.direct.variance / 2) == pytest.approx(295)
    assert rank.direct.per_level == 2.4
    assert rank.direct.coefficient == pytest.approx(0.857, abs=5e-4)


def _rank(number: int, level: int, max_level: int) -> Rank:
    return Rank(number, number, level, max_level, 10, 3000, Direct(10, 0, 0, 0.857), None, FROM_CLIENT, FROM_CLIENT)


def test_rank_docs_fill_a_missing_max_level_from_the_next_rank() -> None:
    docs = rank_docs([_rank(2, 22, 0), _rank(1, 16, 21), _rank(3, 28, 0)])
    assert [d["rank"] for d in docs] == [1, 2, 3]
    assert (docs[0]["maxLevel"], docs[0]["maxLevelFrom"], docs[0]["fullBonusUntil"]) == (21, "client", 26)
    assert (docs[1]["maxLevel"], docs[1]["maxLevelFrom"], docs[1]["fullBonusUntil"]) == (27, "nextRank", 32)
    # The top rank with no max level never gets the downranking penalty.
    assert (docs[2]["maxLevel"], docs[2]["maxLevelFrom"], docs[2]["fullBonusUntil"]) == (None, None, None)
    assert docs[0]["lowLevelFactor"] == 0.85


# --- the committed output ----------------------------------------------------


def _committed() -> dict:
    return json.loads((DOWNRANK_DIR / "spells.json").read_text(encoding="utf-8"))


def test_committed_output_covers_every_family_with_ranks_in_order() -> None:
    doc = _committed()
    assert doc["clientBuild"] == WAGO_BUILD
    assert [f["id"] for f in doc["families"]] == [f.id for f in FAMILIES]
    classic = json.loads((CLASSIC_DIR / "ranks.json").read_text(encoding="utf-8"))
    extra = {f["id"]: f["ranks"] for f in classic["families"]}
    assert (CLASSIC_DIR / "LICENSE").is_file()
    for family in doc["families"]:
        ranks = sorted(family["ranks"] + extra.get(family["id"], []), key=lambda r: r["rank"])
        assert [r["rank"] for r in ranks] == list(range(1, len(ranks) + 1)), family["id"]
        levels = [r["level"] for r in ranks]
        assert levels == sorted(levels), family["id"]
        assert all(r["mana"] > 0 and (r["direct"] or r["periodic"]) for r in ranks), family["id"]
        assert family["icon"] > 0, family["id"]


def test_committed_heal_rank_1_matches_the_forever_tooltip() -> None:
    heal = next(f for f in _committed()["families"] if f["id"] == "priest-heal")
    rank = heal["ranks"][0]
    assert (rank["spell"], rank["level"], rank["maxLevel"], rank["mana"], rank["castMs"]) == (2054, 16, 21, 155, 3000)
    direct = rank["direct"]
    assert direct["coefficient"] == 0.857
    # The Forever tooltip (and the Changes vs Classic feed) reads "Heal your target for 250 to 290."
    low = math.floor(direct["base"] * (1 - direct["variance"] / 2) + 0.5)
    high = math.floor(direct["base"] * (1 + direct["variance"] / 2) + 0.5)
    assert (low, high) == (250, 290)
    assert heal["changedInForever"] is True


def test_every_family_icon_is_in_the_icon_map() -> None:
    wanted = downrank_icon_files()
    assert wanted == {f["icon"] for f in _committed()["families"]}
    files = set(json.loads(ICON_MAP_FILE.read_text(encoding="utf-8"))["files"])
    assert wanted <= files, "re-run python -m scripts.wow_icons.build"
