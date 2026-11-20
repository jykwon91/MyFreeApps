"""Lock the indexes behind the email queue and sync log queries.

Every email queue read filters on the organization (the worker's claim, the
queue list every page polls, the status counts) or on the sync log (per-sync
counts, the cascade delete from ``sync_logs``). The rows are never pruned, so
losing one of these indexes is a silent full scan across every tenant's queue.

The suite builds its schema from the models, so the model and the migration are
checked separately; both must declare the same names on the same columns.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.models.email.email_queue import EmailQueue
from app.models.integrations.sync_log import SyncLog

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "emailqueueidx261120_index_email_queue_and_sync_logs.py"
)

EXPECTED: list[tuple[type, str, list[str]]] = [
    (EmailQueue, "ix_email_queue_org_status_created", ["organization_id", "status", "created_at"]),
    (EmailQueue, "ix_email_queue_org_created", ["organization_id", "created_at"]),
    (EmailQueue, "ix_email_queue_sync_log_status", ["sync_log_id", "status"]),
    (SyncLog, "ix_sync_logs_org_provider_started", ["organization_id", "provider", "started_at"]),
]


@pytest.mark.parametrize(("model", "name", "columns"), EXPECTED)
def test_model_declares_index(model: type, name: str, columns: list[str]) -> None:
    indexes = {ix.name: [c.name for c in ix.columns] for ix in model.__table__.indexes}
    assert indexes.get(name) == columns


@pytest.mark.parametrize(("model", "name", "columns"), EXPECTED)
def test_migration_creates_and_drops_index(model: type, name: str, columns: list[str]) -> None:
    source = MIGRATION_FILE.read_text(encoding="utf-8")
    upgrade, downgrade = source.split("def upgrade()")[1].split("def downgrade()")
    table = model.__tablename__
    column_list = ", ".join(f'"{c}"' for c in columns)
    assert f'"{name}",\n        "{table}",\n        [{column_list}],' in upgrade
    assert f'op.drop_index("{name}", table_name="{table}")' in downgrade


def test_migration_chains_after_rented_since() -> None:
    source = MIGRATION_FILE.read_text(encoding="utf-8")
    assert 'down_revision: str | None = "rentedsince261119"' in source
