"""Verify the migration chain produces the seed rows ``CHANNEL_SEEDS`` declares.

The constants module is the source of truth in code; the migration chain is
the source of truth at deploy time. They must agree exactly — drift here
means a fresh DB rebuild would diverge from a long-running prod DB.

We replay the chain in order:
1. ``j2k4l6m8n0p2_add_channels_and_blackouts`` — initial seed (PR 1.4)
2. ``a1b2c3d4e5f6_correct_furnished_finder_ical_capabilities`` — FF
   correction (2026-05-02): FF doesn't expose iCal, only iCal import from
   Airbnb/VRBO. Both flags flipped to False for ``furnished_finder``.

If a future migration changes another channel's flags, add a step here.
"""
from __future__ import annotations

import re
from pathlib import Path

from app.core.channel_constants import CHANNEL_SEEDS


_VERSIONS_DIR = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions"
)
_SEED_MIGRATION = _VERSIONS_DIR / "j2k4l6m8n0p2_add_channels_and_blackouts.py"
_FF_CORRECTION_MIGRATION = (
    _VERSIONS_DIR / "ffcorr260502_correct_furnished_finder_ical_capabilities.py"
)


def _replay_seed_migration() -> dict[str, dict[str, object]]:
    """Parse the initial seed migration's ``_CHANNEL_SEEDS`` tuple."""
    text = _SEED_MIGRATION.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\("([\w_]+)",\s*"([^"]+)",\s*(True|False),\s*(True|False)\)',
    )
    expected_slugs = {seed["id"] for seed in CHANNEL_SEEDS}
    matches = [m for m in pattern.findall(text) if m[0] in expected_slugs]
    return {
        cid: {
            "id": cid,
            "name": cname,
            "supports_ical_export": exp == "True",
            "supports_ical_import": imp == "True",
        }
        for cid, cname, exp, imp in matches
    }


def _replay_ff_correction(state: dict[str, dict[str, object]]) -> None:
    """Apply the FF capabilities correction in-place."""
    state["furnished_finder"]["supports_ical_export"] = False
    state["furnished_finder"]["supports_ical_import"] = False


def test_migration_chain_matches_constants() -> None:
    state = _replay_seed_migration()
    _replay_ff_correction(state)

    by_slug_const = {s["id"]: s for s in CHANNEL_SEEDS}
    assert set(by_slug_const) == set(state)
    for slug in by_slug_const:
        assert by_slug_const[slug] == state[slug]


def test_ff_correction_migration_clears_both_flags() -> None:
    """Guard against the FF row drifting back to True/True in the constants."""
    text = _FF_CORRECTION_MIGRATION.read_text(encoding="utf-8")
    assert "supports_ical_export = false" in text
    assert "supports_ical_import = false" in text
    assert "id = 'furnished_finder'" in text
