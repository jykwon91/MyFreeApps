"""Lock the shape of the migration that gives pre-#1771 hand-entered rows their Schedule E line.

The default suite builds its schema with ``create_all``, so the migration runs
only on deploy. Checked by hand on Postgres 18: a hand-entered row with no line
created before the cutoff gets its category's line (soft-deleted ones too); a
row that already had a line, one created after the cutoff, an extracted row and
a category with no line are untouched; only the affected org's unfiled return is
flagged for recompute; a rerun changes nothing.
"""
from __future__ import annotations

from pathlib import Path

import pytest

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "schedebf261108_backfill_manual_schedule_e_lines.py"
)


@pytest.fixture(scope="module")
def source() -> str:
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_the_gmail_cleanup_migration(source: str) -> None:
    assert 'down_revision: str | None = "intgcleanup261106"' in source


def test_fills_only_empty_lines_on_hand_entered_rows_before_the_fix_deployed(source: str) -> None:
    where = source.split("WHERE t.category = line_for.category")[1].split("RETURNING")[0]
    assert "t.is_manual" in where
    assert "t.schedule_e_line IS NULL" in where
    assert "t.created_at < '{_CUTOFF}'" in where
    assert '_CUTOFF = "2026-11-07 19:16:43+00"' in source


def test_flags_only_unfiled_returns_of_orgs_with_a_filled_row(source: str) -> None:
    flag = source.split("UPDATE tax_returns r")[1].split("RETURNING")[0]
    assert "needs_recompute = true" in flag
    assert "r.status <> 'filed'" in flag
    assert "SELECT organization_id FROM filled" in flag
