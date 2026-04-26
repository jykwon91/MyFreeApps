"""Regression tests for the alembic migration DAG.

These tests catch structural breakage in the migration chain — most importantly
the class of bug where one migration drops a column and a later migration in
the same chain assumes the column still exists (e.g. the `documents.document_type`
breakage exposed by the fresh-DB CI run in PR #243).

The tests run against the raw migration scripts (no live DB required) so they
fit into the default SQLite pytest suite.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory


BACKEND_DIR = Path(__file__).resolve().parent.parent
VERSIONS_DIR = BACKEND_DIR / "alembic" / "versions"


@pytest.fixture(scope="module")
def script_directory() -> ScriptDirectory:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return ScriptDirectory.from_config(cfg)


def test_single_head(script_directory: ScriptDirectory) -> None:
    """The DAG must resolve to exactly one head — no orphaned branches."""
    heads = script_directory.get_heads()
    assert len(heads) == 1, (
        f"Expected a single alembic head, got {len(heads)}: {heads}. "
        "Orphan heads usually mean a migration's down_revision is stale "
        "after a merge — rebase and re-point the down_revision."
    )


def test_full_walk_from_base_reaches_head(script_directory: ScriptDirectory) -> None:
    """Every revision must be reachable by walking from base → head."""
    heads = script_directory.get_heads()
    assert heads, "No alembic heads found"
    head = heads[0]
    walked: set[str] = set()
    for rev in script_directory.walk_revisions("base", head):
        walked.add(rev.revision)
    all_revs = {rev.revision for rev in script_directory.walk_revisions()}
    missing = all_revs - walked
    assert not missing, (
        f"Revisions not reachable from base→head: {sorted(missing)}. "
        "Likely caused by a stale down_revision pointer."
    )


def test_document_type_restore_migration_is_idempotent() -> None:
    """08cfc089005c runs AFTER c5d6e7f8a9b0 drops documents.document_type, so
    it must re-add the column defensively (ADD COLUMN IF NOT EXISTS) — not
    assume the column is still present. This test locks in the fix so a future
    edit cannot silently re-introduce the fresh-DB failure."""
    migration_path = VERSIONS_DIR / "08cfc089005c_add_document_type_to_documents.py"
    assert migration_path.exists(), f"Expected migration file at {migration_path}"
    source = migration_path.read_text(encoding="utf-8")

    add_column_idempotent = (
        'ADD COLUMN IF NOT EXISTS document_type' in source
        or 'ADD COLUMN IF NOT EXISTS "document_type"' in source
    )
    assert add_column_idempotent, (
        "Migration 08cfc089005c must re-add documents.document_type with "
        "IF NOT EXISTS semantics — upstream migration c5d6e7f8a9b0 drops "
        "the column, so a fresh-DB `alembic upgrade head` would otherwise "
        "fail with 'column document_type does not exist'."
    )
