"""The data steps of the migration that made email reads retryable, on seeded rows.

The suite builds its schema with ``create_all``, so the migration's own SQL is
run here against rows shaped like the old code left them. The full
upgrade / downgrade / upgrade was also run on Postgres 18 with the same rows.
"""
from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_queue_enums import EMAIL_QUEUE_STATUSES
from app.models.email.email_queue import EmailQueue
from app.models.integrations.sync_log import SyncLog
from app.models.organization.organization import Organization
from app.models.user.user import User

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "emailqueueretry261121_email_queue_extraction_attempts.py"
)


@pytest.fixture(scope="module")
def migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("emailqueueretry261121", MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _seed(
    db: AsyncSession, user: User, org: Organization, *, status: str, error: str | None,
    raw_content: bytes | None = b"bytes", attempts: int = 0,
) -> uuid.UUID:
    log = SyncLog(
        organization_id=org.id, user_id=user.id, provider="gmail",
        status="failed", started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.flush()
    item = EmailQueue(
        organization_id=org.id, user_id=user.id, message_id=f"m_{uuid.uuid4().hex[:8]}",
        attachment_id="att", sync_log_id=log.id, status=status, error=error,
        raw_content=raw_content, attempts=attempts,
    )
    db.add(item)
    await db.commit()
    return item.id


async def _row(db: AsyncSession, item_id: uuid.UUID) -> tuple[str, str | None, int]:
    result = await db.execute(
        select(EmailQueue.status, EmailQueue.error, EmailQueue.attempts).where(EmailQueue.id == item_id)
    )
    status, error, attempts = result.one()
    return status, error, attempts


async def test_emails_lost_to_the_old_read_timeout_are_queued_again(
    db: AsyncSession, test_user: User, test_org: Organization, migration: ModuleType,
) -> None:
    timed_out = await _seed(db, test_user, test_org, status="failed", error="Extraction timed out", attempts=3)
    no_bytes = await _seed(db, test_user, test_org, status="failed", error="Extraction timed out", raw_content=None)
    other = await _seed(db, test_user, test_org, status="failed", error="Fetch timed out")
    sdk_text = await _seed(db, test_user, test_org, status="failed", error="Error code: 529 overloaded")
    done = await _seed(db, test_user, test_org, status="done", error="Extraction timed out")

    result = await db.execute(migration.REQUEUE_TIMED_OUT_SQL)
    await db.commit()

    assert result.rowcount == 1
    assert await _row(db, timed_out) == ("fetched", None, 0)
    assert await _row(db, no_bytes) == ("failed", "Extraction timed out", 0)
    assert await _row(db, other) == ("failed", "Fetch timed out", 0)
    assert await _row(db, sdk_text) == ("failed", "Error code: 529 overloaded", 0)
    assert await _row(db, done) == ("done", "Extraction timed out", 0)


async def test_rows_dismissed_mid_read_become_dismissed_and_back_on_downgrade(
    db: AsyncSession, test_user: User, test_org: Organization, migration: ModuleType,
) -> None:
    dismissed = await _seed(db, test_user, test_org, status="failed", error="Dismissed by user")
    failed = await _seed(db, test_user, test_org, status="failed", error="Something else")

    await db.execute(migration.MARK_DISMISSED_SQL)
    await db.commit()
    assert await _row(db, dismissed) == ("dismissed", None, 0)
    assert await _row(db, failed) == ("failed", "Something else", 0)

    await db.execute(migration.UNMARK_DISMISSED_SQL)
    await db.commit()
    assert await _row(db, dismissed) == ("failed", "Dismissed by user", 0)
    assert await _row(db, failed) == ("failed", "Something else", 0)


def test_the_constraint_lists_every_status_the_app_writes(migration: ModuleType) -> None:
    listed = tuple(v.strip().strip("'") for v in migration._STATUSES.split(","))
    assert listed == EMAIL_QUEUE_STATUSES


def test_the_status_constraint_spares_existing_rows_and_downgrade_is_bounded(migration: ModuleType) -> None:
    source = MIGRATION_FILE.read_text(encoding="utf-8")
    assert "NOT VALID" in source
    downgrade = source.split("def downgrade() -> None:")[1]
    assert "SET LOCAL lock_timeout = '5s'" in downgrade
    assert "DROP CONSTRAINT IF EXISTS chk_email_queue_status" in downgrade


async def test_the_model_refuses_an_unknown_status(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item_id = await _seed(db, test_user, test_org, status="done", error=None)
    with pytest.raises(Exception, match="CHECK constraint failed"):
        await db.execute(text("UPDATE email_queue SET status = 'gone' WHERE id = :id"), {"id": item_id.hex})
    await db.rollback()
