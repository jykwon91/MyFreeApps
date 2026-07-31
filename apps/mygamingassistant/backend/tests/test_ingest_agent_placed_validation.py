"""``ingest_agent._validate`` must treat a missing THROW span as meaningful.

A spans pack with no ``throw`` entry is ambiguous on its face. For placed
utility (Cypher's trapwire/spycam, Killjoy's alarmbot/turret, Chamber's
trademark, Deadlock's sonic sensor) it is CORRECT — a mounted device never
leaves the player's hands, so the lineup is a complete three-beat
STAND/AIM/LANDING story. For thrown utility it means the pack is truncated
and the recut would silently produce a lineup missing its central beat.

Only ``utility_type.placement`` separates the two, so the validator has to be
strict in BOTH directions. This is the guard the whole placed-utility pipeline
rests on: a wrong ``placed`` drops a real throw clip, a wrong ``thrown``
demands a beat that does not exist on screen and fails every row.

``_validate`` is pure (no DB), so it is tested directly against stub utility
objects rather than through the driver's subcommands.
"""
import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "ingest_agent.py"


def _load_driver():
    """Import scripts/ingest_agent.py by path — scripts/ is not a package."""
    spec = importlib.util.spec_from_file_location("_ingest_agent_under_test", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Util:
    """Minimal stand-in for UtilityType — _validate only reads ``placement``."""

    def __init__(self, placement: str) -> None:
        self.placement = placement


UTILS = {"trapwire": _Util("placed"), "recon": _Util("thrown")}
ZONES = {"a-main": "z1", "a-site": "z2"}


def _pack(ability: str, spans: dict) -> dict:
    return {
        "lineups": [
            {
                "cs": 12,
                "title": "A Site Trip",
                "ability": ability,
                "target": "a-site",
                "stand": "a-main",
                "side": "side_a",
                "spans": spans,
            }
        ]
    }


THREE = {"stand": [1.0, 2.0], "aim": [3.0, 4.0], "landing": [8.0, 9.0]}
FOUR = {**THREE, "throw": [5.0, 6.0]}


def test_placed_utility_validates_without_a_throw_span():
    """The whole point: three beats is COMPLETE for a mounted device."""
    _load_driver()._validate(_pack("trapwire", THREE), ZONES, UTILS)


def test_thrown_utility_still_requires_a_throw_span():
    """Dropping the throw requirement wholesale would let truncated packs
    through and silently produce lineups missing their central beat."""
    with pytest.raises(SystemExit) as exc:
        _load_driver()._validate(_pack("recon", THREE), ZONES, UTILS)
    assert "missing 'throw' span" in str(exc.value)


def test_placed_utility_rejects_a_supplied_throw_span():
    """A throw span on placed utility means the localizer either misread the
    ability or invented a beat. Accepting it silently would bake that error in,
    so it fails as loudly as the missing-span case."""
    with pytest.raises(SystemExit) as exc:
        _load_driver()._validate(_pack("trapwire", FOUR), ZONES, UTILS)
    assert "placed utility" in str(exc.value)


def test_thrown_utility_validates_with_all_four_beats():
    """Regression guard — the common path must be untouched by the above."""
    _load_driver()._validate(_pack("recon", FOUR), ZONES, UTILS)
