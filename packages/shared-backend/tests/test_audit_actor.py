"""``audit_actor`` sets the audit user for a block and always restores the previous one."""
from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from platform_shared.core.audit import current_user_id, register_audit_listeners
from platform_shared.core.audit_actor import audit_actor
from platform_shared.core.audit_config import AuditConfig
from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog
from tests.test_audit import _Widget


def test_sets_the_user_inside_the_block_and_restores_none_after() -> None:
    user_id = uuid.uuid4()
    with audit_actor(user_id):
        assert current_user_id.get() == str(user_id)
    assert current_user_id.get() is None


def test_accepts_a_string_id() -> None:
    with audit_actor("user-7"):
        assert current_user_id.get() == "user-7"


def test_nested_blocks_restore_the_outer_user() -> None:
    with audit_actor("outer"):
        with audit_actor("inner"):
            assert current_user_id.get() == "inner"
        assert current_user_id.get() == "outer"
    assert current_user_id.get() is None


def test_restores_the_previous_user_when_the_block_raises() -> None:
    with audit_actor("outer"):
        with pytest.raises(RuntimeError), audit_actor("inner"):
            raise RuntimeError("job failed")
        assert current_user_id.get() == "outer"
    assert current_user_id.get() is None


@pytest.mark.asyncio
async def test_concurrent_jobs_each_keep_their_own_user() -> None:
    async def job(user: str) -> str | None:
        with audit_actor(user):
            await asyncio.sleep(0)
            return current_user_id.get()

    assert await asyncio.gather(job("a"), job("b")) == ["a", "b"]
    assert current_user_id.get() is None


@pytest.mark.asyncio
async def test_writes_inside_the_block_are_audited_as_that_user() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    register_audit_listeners(AuditConfig(sensitive_fields=frozenset(), skip_tables=frozenset(), skip_fields=frozenset()))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            with audit_actor("worker-user"):
                db.add(_Widget(name="x"))
                await db.commit()
            rows = (await db.execute(
                select(AuditLog).where(AuditLog.table_name == "test_widgets"),
            )).scalars().all()
    finally:
        await engine.dispose()
    assert rows
    assert {r.changed_by for r in rows} == {"worker-user"}
