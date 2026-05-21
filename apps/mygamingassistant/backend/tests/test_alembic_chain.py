"""Regression tests for the alembic migration DAG.

These run against the raw migration scripts (no live DB) so they fit the
default pytest suite. They lock in that the chain resolves to a single head
(currently ``0013``) and that every revision is reachable base → head — the
class of bug where a new migration's ``down_revision`` is stale after a
merge and silently orphans the chain.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def script_directory() -> ScriptDirectory:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return ScriptDirectory.from_config(cfg)


def test_single_head_is_0015(script_directory: ScriptDirectory) -> None:
    """The DAG must resolve to exactly one head and it must be 0015.

    Bump this pin (and add a down_revision assertion below) in the same PR
    that adds a new migration — same per-PR contract as the fixture
    conformance guards.
    """
    heads = script_directory.get_heads()
    assert len(heads) == 1, (
        f"Expected a single alembic head, got {len(heads)}: {heads}. "
        "Orphan heads usually mean a migration's down_revision is stale "
        "after a merge — rebase and re-point the down_revision."
    )
    assert heads[0] == "0015", (
        f"Expected head 0015 (lineup clip *_original keys + trim offsets), "
        f"got {heads[0]}."
    )


def test_full_walk_from_base_reaches_head(
    script_directory: ScriptDirectory,
) -> None:
    """Every revision must be reachable by walking from base → head."""
    heads = script_directory.get_heads()
    assert heads, "No alembic heads found"
    head = heads[0]
    walked = {rev.revision for rev in script_directory.walk_revisions("base", head)}
    all_revs = {rev.revision for rev in script_directory.walk_revisions()}
    missing = all_revs - walked
    assert not missing, (
        f"Revisions not reachable from base→head: {sorted(missing)}. "
        "Likely caused by a stale down_revision pointer."
    )


def test_0008_down_revision_points_at_0007(
    script_directory: ScriptDirectory,
) -> None:
    """0008 must chain directly off 0007 (the screenshot-key repair)."""
    rev = script_directory.get_revision("0008")
    assert rev.down_revision == "0007"


def test_0009_down_revision_points_at_0008(
    script_directory: ScriptDirectory,
) -> None:
    """0009 must chain directly off 0008 (the CS2 polygon backfill)."""
    rev = script_directory.get_revision("0009")
    assert rev.down_revision == "0008"


def test_0010_down_revision_points_at_0009(
    script_directory: ScriptDirectory,
) -> None:
    """0010 must chain directly off 0009 (the lineup clip_url column)."""
    rev = script_directory.get_revision("0010")
    assert rev.down_revision == "0009"


def test_0011_down_revision_points_at_0010(
    script_directory: ScriptDirectory,
) -> None:
    """0011 must chain directly off 0010 (the lineup technique column)."""
    rev = script_directory.get_revision("0011")
    assert rev.down_revision == "0010"


def test_0012_down_revision_points_at_0011(
    script_directory: ScriptDirectory,
) -> None:
    """0012 must chain directly off 0011 (the lineup landing_clip_url column)."""
    rev = script_directory.get_revision("0012")
    assert rev.down_revision == "0011"


def test_0013_down_revision_points_at_0012(
    script_directory: ScriptDirectory,
) -> None:
    """0013 must chain directly off 0012 (removes cs2 decoy utility type)."""
    rev = script_directory.get_revision("0013")
    assert rev.down_revision == "0012"


def test_0014_down_revision_points_at_0013(
    script_directory: ScriptDirectory,
) -> None:
    """0014 must chain directly off 0013 (lineup stand/aim micro-clip columns)."""
    rev = script_directory.get_revision("0014")
    assert rev.down_revision == "0013"


def test_0015_down_revision_points_at_0014(
    script_directory: ScriptDirectory,
) -> None:
    """0015 must chain directly off 0014 (lineup clip *_original keys + trim offsets)."""
    rev = script_directory.get_revision("0015")
    assert rev.down_revision == "0014"
