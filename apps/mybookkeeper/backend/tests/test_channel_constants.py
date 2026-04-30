"""Verify the migration's seed list matches ``CHANNEL_SEEDS``.

Both must agree exactly — the migration is the source of truth for what
ships in the DB at deploy time, but the constants module is the source of
truth in code. Drift here means a re-run of the migration on a fresh DB
would produce different rows than the live DB.
"""
from __future__ import annotations

import re
from pathlib import Path

from app.core.channel_constants import CHANNEL_SEEDS


_MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "j2k4l6m8n0p2_add_channels_and_blackouts.py"
)


def test_migration_seed_matches_constants() -> None:
    text = _MIGRATION_PATH.read_text(encoding="utf-8")

    # Extract every tuple from the migration's _CHANNEL_SEEDS literal.
    # Format: ("airbnb", "Airbnb", True, True),
    pattern = re.compile(
        r'\("([\w_]+)",\s*"([^"]+)",\s*(True|False),\s*(True|False)\)',
    )
    raw_matches = pattern.findall(text)
    # Only keep the matches inside _CHANNEL_SEEDS — the file may contain
    # other tuples elsewhere, but as of this PR there are none. Be safe:
    # filter by the known channel slugs.
    expected_slugs = {seed["id"] for seed in CHANNEL_SEEDS}
    matches = [m for m in raw_matches if m[0] in expected_slugs]

    assert len(matches) == len(CHANNEL_SEEDS), (
        f"Expected {len(CHANNEL_SEEDS)} channels in migration; saw {len(matches)}"
    )

    migration_seeds = [
        {
            "id": cid,
            "name": cname,
            "supports_ical_export": exp == "True",
            "supports_ical_import": imp == "True",
        }
        for cid, cname, exp, imp in matches
    ]

    # Compare in slug order (stable across re-runs).
    by_slug_const = {s["id"]: s for s in CHANNEL_SEEDS}
    by_slug_mig = {s["id"]: s for s in migration_seeds}
    assert set(by_slug_const) == set(by_slug_mig)
    for slug in by_slug_const:
        assert by_slug_const[slug] == by_slug_mig[slug]
