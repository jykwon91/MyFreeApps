"""Tests for platform_shared.repositories.audited_writes.

A bulk ``update()`` / ``delete()`` or an ``INSERT ... ON CONFLICT`` upsert never
reaches the audit listener; these helpers make the same change through the ORM
so it does. The SQLite tests check the audit rows and the conditional
semantics. The Postgres tests check the concurrency: a second writer with the
same guard waits for the first and then finds nothing to change, as a second
conditional UPDATE would; and two writers upserting one new key end up on one
row, as two ``ON CONFLICT`` inserts would.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from typing import cast
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import Executable, Integer, String, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.core.audit import register_audit_listeners
from platform_shared.core.audit_actor import audit_actor
from platform_shared.core.audit_config import AuditConfig
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.repositories.audited_writes import (
    delete_rows,
    insert_if_absent,
    lock_rows,
    update_rows,
    upsert_row,
)

POSTGRES_URL_ENV = "SHARED_BACKEND_TEST_POSTGRES_URL"
ACTOR = "11111111-1111-1111-1111-111111111111"


class _Base(DeclarativeBase):
    """Kept off the shared ``Base`` so this table exists only in these tests."""


class _Job(_Base):
    __tablename__ = "test_audited_write_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(100), nullable=True)
    secret: Mapped[str | None] = mapped_column(String(100), nullable=True)


class _Item(_Base):
    """A row keyed by a unique ``code`` that isn't its primary key, as upserts usually are."""

    __tablename__ = "test_audited_upsert_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    value: Mapped[str] = mapped_column(String(100))
    secret: Mapped[str | None] = mapped_column(String(100), nullable=True)


_CONFIG = AuditConfig(
    sensitive_fields=frozenset({"secret"}), skip_tables=frozenset(), skip_fields=frozenset(),
)


@pytest_asyncio.fixture()
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.create_all)
        await conn.run_sync(AuditLog.__table__.create)
    register_audit_listeners(_CONFIG, base=_Base)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


async def _seed(db: AsyncSession, *statuses: str) -> list[_Job]:
    jobs = [_Job(id=i, status=status) for i, status in enumerate(statuses, start=1)]
    db.add_all(jobs)
    await db.flush()
    await db.execute(AuditLog.__table__.delete())
    return jobs


async def _audit(db: AsyncSession, operation: str) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog).where(AuditLog.operation == operation).order_by(AuditLog.record_id, AuditLog.field_name),
    )
    return list(result.scalars())


async def test_update_rows_audits_each_changed_field_as_the_actor(db: AsyncSession) -> None:
    await _seed(db, "pending", "pending", "done")

    with audit_actor(ACTOR):
        changed = await update_rows(
            db, _Job, _Job.status == "pending", values={"status": "sent", "secret": "s3cret"},
        )

    assert sorted(job.id for job in changed) == [1, 2]
    rows = await _audit(db, "UPDATE")
    assert [(r.table_name, r.record_id, r.field_name, r.old_value, r.new_value) for r in rows] == [
        ("test_audited_write_jobs", "1", "secret", None, "***"),
        ("test_audited_write_jobs", "1", "status", "pending", "sent"),
        ("test_audited_write_jobs", "2", "secret", None, "***"),
        ("test_audited_write_jobs", "2", "status", "pending", "sent"),
    ]
    assert {r.changed_by for r in rows} == {ACTOR}


async def test_update_rows_leaves_rows_the_guard_no_longer_matches(db: AsyncSession) -> None:
    """The caller read the row as pending; another writer finished it since."""
    (job,) = await _seed(db, "pending")
    await db.execute(
        update(_Job).where(_Job.id == 1).values(status="done").execution_options(synchronize_session=False),
    )
    assert job.status == "pending"  # the caller's copy is stale

    changed = await update_rows(db, _Job, _Job.id == 1, _Job.status == "pending", values={"status": "sent"})

    assert changed == []
    assert await _audit(db, "UPDATE") == []
    assert (await db.execute(select(_Job.status).where(_Job.id == 1))).scalar_one() == "done"


async def test_lock_rows_refreshes_the_object_the_caller_holds(db: AsyncSession) -> None:
    (job,) = await _seed(db, "pending")
    await db.execute(
        update(_Job).where(_Job.id == 1).values(note="changed").execution_options(synchronize_session=False),
    )

    (locked,) = await lock_rows(db, _Job, _Job.id == 1)

    assert locked is job
    assert job.note == "changed"


async def test_update_rows_refuses_a_name_that_is_no_column(db: AsyncSession) -> None:
    await _seed(db, "pending")

    with pytest.raises(ValueError, match="no columns \\['bogus'\\]"):
        await update_rows(db, _Job, _Job.id == 1, values={"bogus": 1})


async def test_delete_rows_audits_each_deleted_row_as_the_actor(db: AsyncSession) -> None:
    await _seed(db, "pending", "done")

    with audit_actor(ACTOR):
        deleted = await delete_rows(db, _Job, _Job.status == "done")

    assert [job.id for job in deleted] == [2]
    rows = await _audit(db, "DELETE")
    assert {(r.record_id, r.field_name, r.old_value) for r in rows} >= {("2", "id", "2"), ("2", "status", "done")}
    assert {r.changed_by for r in rows} == {ACTOR}
    assert (await db.execute(select(_Job.id))).scalars().all() == [1]


class _StatementRecorder:
    """Stands in for the session: keeps the statement ``lock_rows`` runs and matches no rows."""

    def __init__(self) -> None:
        self.statement: Executable | None = None

    async def execute(self, statement: Executable) -> MagicMock:
        self.statement = statement
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        return result


async def test_lock_rows_locks_only_the_target_table_in_primary_key_order() -> None:
    recorder = _StatementRecorder()
    await lock_rows(cast(AsyncSession, recorder), _Job, _Job.id == 1)

    assert recorder.statement is not None
    compiled = str(recorder.statement.compile(dialect=postgresql.dialect()))
    assert compiled.endswith("ORDER BY test_audited_write_jobs.id FOR UPDATE OF test_audited_write_jobs")


# --------------------------------------------------------------------------
# Postgres: the row lock serialises two conditional writers
# --------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def pg_sessions() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    url = os.environ.get(POSTGRES_URL_ENV)
    if not url:
        # CI sets this, so the test can't quietly stop running there.
        if os.environ.get("CI"):
            pytest.fail(f"{POSTGRES_URL_ENV} isn't set")
        pytest.skip(f"{POSTGRES_URL_ENV} isn't set")
    schema = f"audited_writes_{uuid.uuid4().hex}"
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    async with engine.begin() as connection:
        await connection.execute(text(f"CREATE SCHEMA {schema}"))
        await connection.run_sync(_Base.metadata.create_all)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        async with engine.begin() as connection:
            await connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        await engine.dispose()


async def test_a_second_conditional_writer_waits_then_finds_nothing(
    pg_sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with pg_sessions() as setup:
        setup.add(_Job(id=1, status="pending"))
        await setup.commit()

    async with pg_sessions() as first, pg_sessions() as second:
        claimed = await update_rows(first, _Job, _Job.id == 1, _Job.status == "pending", values={"status": "sent"})
        assert len(claimed) == 1

        racing = asyncio.create_task(
            update_rows(second, _Job, _Job.id == 1, _Job.status == "pending", values={"status": "sent"}),
        )
        await asyncio.sleep(0.3)
        assert not racing.done(), "the second writer didn't wait for the first one's row lock"

        await first.commit()
        assert await asyncio.wait_for(racing, timeout=5) == []
        await second.commit()


async def test_a_second_writer_wins_when_the_first_rolls_back(
    pg_sessions: async_sessionmaker[AsyncSession],
) -> None:
    """Unlike SKIP LOCKED: a claim that never committed doesn't hide the row."""
    async with pg_sessions() as setup:
        setup.add(_Job(id=1, status="pending"))
        await setup.commit()

    async with pg_sessions() as first, pg_sessions() as second:
        await update_rows(first, _Job, _Job.id == 1, _Job.status == "pending", values={"status": "sent"})
        racing = asyncio.create_task(
            update_rows(second, _Job, _Job.id == 1, _Job.status == "pending", values={"status": "sent"}),
        )
        await asyncio.sleep(0.3)
        await first.rollback()

        assert [job.id for job in await asyncio.wait_for(racing, timeout=5)] == [1]
        await second.commit()


# --------------------------------------------------------------------------
# Upserts (SQLite): audit rows and ON CONFLICT semantics
# --------------------------------------------------------------------------


async def _seed_item(db: AsyncSession, code: str, value: str) -> _Item:
    item = _Item(code=code, value=value)
    db.add(item)
    await db.flush()
    await db.flush()  # writes the listener's INSERT audit rows, so they can be cleared
    await db.execute(AuditLog.__table__.delete())
    return item


async def _item_audit(db: AsyncSession) -> list[tuple[str, str, str, str | None, str | None, str | None]]:
    await db.flush()  # the listener's audit rows are written on the next flush
    result = await db.execute(
        select(AuditLog).where(AuditLog.table_name == _Item.__tablename__).order_by(AuditLog.field_name),
    )
    return [
        (r.operation, r.record_id, r.field_name, r.old_value, r.new_value, r.changed_by)
        for r in result.scalars()
    ]


async def test_upsert_row_inserts_a_new_key_and_audits_the_insert(db: AsyncSession) -> None:
    with audit_actor(ACTOR):
        item, created = await upsert_row(
            db, _Item, _Item.code == "a",
            create={"code": "a", "value": "one", "secret": "s"}, update={"value": "one"},
        )

    assert created is True
    assert item.id is not None
    assert await _item_audit(db) == [
        ("INSERT", str(item.id), "code", None, "a", ACTOR),
        ("INSERT", str(item.id), "id", None, str(item.id), ACTOR),
        ("INSERT", str(item.id), "secret", None, "***", ACTOR),
        ("INSERT", str(item.id), "value", None, "one", ACTOR),
    ]


async def test_upsert_row_updates_an_existing_key_and_audits_the_change(db: AsyncSession) -> None:
    existing = await _seed_item(db, "a", "one")

    with audit_actor(ACTOR):
        item, created = await upsert_row(
            db, _Item, _Item.code == "a", create={"code": "a", "value": "two"}, update={"value": "two"},
        )

    assert (item, created) == (existing, False)
    assert await _item_audit(db) == [("UPDATE", str(existing.id), "value", "one", "two", ACTOR)]
    assert (await db.execute(select(func.count()).select_from(_Item))).scalar_one() == 1


async def test_upsert_row_writes_nothing_when_the_update_changes_nothing(db: AsyncSession) -> None:
    existing = await _seed_item(db, "a", "one")

    item, created = await upsert_row(
        db, _Item, _Item.code == "a", create={"code": "a", "value": "one"}, update={"value": "one"},
    )

    assert (item, created) == (existing, False)
    assert await _item_audit(db) == []


async def test_upsert_row_refuses_a_name_that_is_no_column(db: AsyncSession) -> None:
    with pytest.raises(ValueError, match="no columns \\['bogus'\\]"):
        await upsert_row(db, _Item, _Item.code == "a", create={"code": "a", "value": "x"}, update={"bogus": 1})


async def test_insert_if_absent_inserts_a_new_key_and_audits_it(db: AsyncSession) -> None:
    with audit_actor(ACTOR):
        item = await insert_if_absent(db, _Item, _Item.code == "a", create={"code": "a", "value": "one"})

    assert item is not None
    assert [(op, field, new) for op, _, field, _, new, _ in await _item_audit(db)] == [
        ("INSERT", "code", "a"), ("INSERT", "id", str(item.id)), ("INSERT", "value", "one"),
    ]


async def test_insert_if_absent_leaves_an_existing_key_alone(db: AsyncSession) -> None:
    await _seed_item(db, "a", "one")

    assert await insert_if_absent(db, _Item, _Item.code == "a", create={"code": "a", "value": "two"}) is None

    assert await _item_audit(db) == []
    assert (await db.execute(select(_Item.value))).scalars().all() == ["one"]


async def test_insert_if_absent_raises_a_violation_that_is_not_the_key(db: AsyncSession) -> None:
    """A NOT NULL failure is no conflict: it surfaces, as it did from the INSERT."""
    with pytest.raises(IntegrityError):
        await insert_if_absent(db, _Item, _Item.code == "a", create={"code": "a", "value": None})

    # The SAVEPOINT rolled back only the insert; the session still works.
    assert await insert_if_absent(db, _Item, _Item.code == "a", create={"code": "a", "value": "ok"}) is not None


# --------------------------------------------------------------------------
# Upserts (Postgres): two writers on one new key end up on one row
# --------------------------------------------------------------------------


async def _audited_pg_setup(pg_sessions: async_sessionmaker[AsyncSession]) -> None:
    async with pg_sessions() as setup:
        await (await setup.connection()).run_sync(lambda conn: AuditLog.__table__.create(conn))
        await setup.commit()
    register_audit_listeners(_CONFIG, base=_Base)


async def test_upsert_row_loser_of_an_insert_race_updates_the_winner(
    pg_sessions: async_sessionmaker[AsyncSession],
) -> None:
    await _audited_pg_setup(pg_sessions)

    async with pg_sessions() as first, pg_sessions() as second:
        with audit_actor(ACTOR):
            _, first_created = await upsert_row(
                first, _Item, _Item.code == "a", create={"code": "a", "value": "one"}, update={"value": "one"},
            )
            racing = asyncio.create_task(upsert_row(
                second, _Item, _Item.code == "a", create={"code": "a", "value": "two"}, update={"value": "two"},
            ))
        await asyncio.sleep(0.3)
        assert not racing.done(), "the second insert didn't wait for the first one's uncommitted key"

        await first.commit()
        item, second_created = await asyncio.wait_for(racing, timeout=5)
        await second.commit()

    assert (first_created, second_created) == (True, False)
    async with pg_sessions() as check:
        assert (await check.execute(select(_Item.code, _Item.value))).all() == [("a", "two")]
        assert await _item_audit(check) == [
            ("INSERT", str(item.id), "code", None, "a", ACTOR),
            ("INSERT", str(item.id), "id", None, str(item.id), ACTOR),
            ("INSERT", str(item.id), "value", None, "one", ACTOR),
            ("UPDATE", str(item.id), "value", "one", "two", ACTOR),
        ]


async def test_insert_if_absent_loser_of_an_insert_race_finds_the_winner(
    pg_sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with pg_sessions() as first, pg_sessions() as second:
        won = await insert_if_absent(first, _Item, _Item.code == "a", create={"code": "a", "value": "one"})
        racing = asyncio.create_task(
            insert_if_absent(second, _Item, _Item.code == "a", create={"code": "a", "value": "two"}),
        )
        await asyncio.sleep(0.3)
        assert not racing.done()

        await first.commit()
        assert won is not None
        assert await asyncio.wait_for(racing, timeout=5) is None
        await second.commit()

    async with pg_sessions() as check:
        assert (await check.execute(select(_Item.value))).scalars().all() == ["one"]


async def test_upsert_row_inserts_when_the_racing_insert_rolls_back(
    pg_sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with pg_sessions() as first, pg_sessions() as second:
        await upsert_row(first, _Item, _Item.code == "a", create={"code": "a", "value": "one"}, update={"value": "one"})
        racing = asyncio.create_task(upsert_row(
            second, _Item, _Item.code == "a", create={"code": "a", "value": "two"}, update={"value": "two"},
        ))
        await asyncio.sleep(0.3)
        await first.rollback()

        _, created = await asyncio.wait_for(racing, timeout=5)
        await second.commit()

    assert created is True
    async with pg_sessions() as check:
        assert (await check.execute(select(_Item.value))).scalars().all() == ["two"]
