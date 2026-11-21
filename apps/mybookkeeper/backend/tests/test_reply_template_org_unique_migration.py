"""Lock the shape of the migration that makes reply template names unique per org.

The default suite builds its schema with ``create_all`` from the model, so the
migration itself is not exercised there. Checked by hand on Postgres 18 and
SQLite: existing rows survive the upgrade, a name can then be reused in a second
organization, and the downgrade restores the per-person constraint.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.models.inquiries.reply_template import ReplyTemplate

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "rtplorgname261121_reply_template_name_unique_per_org.py"
)


@pytest.fixture(scope="module")
def source() -> str:
    return MIGRATION_FILE.read_text(encoding="utf-8")


def test_chains_after_the_email_queue_index_migration(source: str) -> None:
    assert 'down_revision: str | None = "emailqueueidx261120"' in source


def test_new_constraint_matches_the_model_and_is_not_partial(source: str) -> None:
    assert 'batch.create_unique_constraint(_NEW, ["organization_id", "user_id", "name"])' in source
    assert "postgresql_where" not in source
    constraint = next(
        c for c in ReplyTemplate.__table__.constraints
        if c.name == "uq_reply_template_org_user_name"
    )
    assert [col.name for col in constraint.columns] == ["organization_id", "user_id", "name"]


def test_the_migration_never_touches_rows(source: str) -> None:
    for verb in ("DELETE", "UPDATE", "INSERT", "op.execute(\"DROP"):
        assert verb not in source
