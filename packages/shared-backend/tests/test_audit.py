"""Tests for platform_shared.core.audit.

Exercises the registration API and the SQLAlchemy after_flush listener against
a fresh in-memory SQLite database — no MBK / MJH fixtures referenced. The
shared module is the contract; consumer apps add their own PII column lists
on top.
"""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable

import pytest
import pytest_asyncio
from sqlalchemy import Integer, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.core import audit as audit_module
from platform_shared.core.audit import (
    current_user_id,
    get_sensitive_fields,
    get_skip_tables,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
    reset_registry,
)
from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog


class _Widget(Base):
    """Minimal table used to drive the listener in isolation."""
    __tablename__ = "test_widgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    password: Mapped[str | None] = mapped_column(String(100), nullable=True)
    secret_token: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_content: Mapped[str | None] = mapped_column(String(100), nullable=True)


class _SecretBag(Base):
    """A second table used to test the skip-table behaviour."""
    __tablename__ = "test_secret_bag"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payload: Mapped[str] = mapped_column(String(100))


@pytest.fixture(autouse=True)
def _reset() -> None:
    """Each test starts with a clean registry — module state is global."""
    reset_registry()


@pytest_asyncio.fixture()
async def db() -> AsyncIterator[AsyncSession]:
    """In-memory SQLite session with shared Base + AuditLog metadata."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with sessionmaker() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture()
async def listener_attached() -> None:
    """Register the listener once for the test. Reset_registry already cleared
    ``_listeners_registered`` so the registration takes effect."""
    register_audit_listeners()


class TestRegistrationAPI:
    def test_default_skip_tables_includes_audit_logs(self) -> None:
        # Recursion guard ships by default — apps don't need to opt in.
        assert "audit_logs" in get_skip_tables()

    def test_default_sensitive_fields_is_empty(self) -> None:
        # Apps populate this — shared has no PII opinions.
        assert get_sensitive_fields() == frozenset()

    def test_register_sensitive_fields_accumulates(self) -> None:
        register_sensitive_fields(["password"])
        register_sensitive_fields(["secret_token"])
        assert "password" in get_sensitive_fields()
        assert "secret_token" in get_sensitive_fields()

    def test_register_sensitive_fields_accepts_set_or_list(self) -> None:
        register_sensitive_fields({"a", "b"})
        register_sensitive_fields(["c"])
        register_sensitive_fields(("d",))
        assert {"a", "b", "c", "d"}.issubset(get_sensitive_fields())

    def test_register_skip_tables_extends_default(self) -> None:
        register_skip_tables(["usage_logs", "auth_events"])
        skip = get_skip_tables()
        assert "audit_logs" in skip
        assert "usage_logs" in skip
        assert "auth_events" in skip

    def test_reset_registry_restores_seed_defaults(self) -> None:
        register_sensitive_fields(["password"])
        register_skip_tables(["foo"])
        reset_registry()
        assert get_sensitive_fields() == frozenset()
        assert get_skip_tables() == frozenset({"audit_logs"})

    def test_register_audit_listeners_is_idempotent(self) -> None:
        register_audit_listeners()
        register_audit_listeners()
        register_audit_listeners()
        # No exception, no duplicate listener attachment — the second + third
        # calls are no-ops by design.
        assert audit_module._listeners_registered is True


class TestListenerInsert:
    @pytest.mark.asyncio
    async def test_insert_writes_per_field_rows(
        self, db: AsyncSession, listener_attached: None,
    ) -> None:
        w = _Widget(name="hello", password="hunter2")
        db.add(w)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(AuditLog.table_name == "test_widgets"),
        )).scalars().all()

        # One row per non-skipped, loaded attribute.
        by_field = {r.field_name: r for r in rows}
        assert "name" in by_field
        assert "password" in by_field
        assert all(r.operation == "INSERT" for r in rows)

    @pytest.mark.asyncio
    async def test_password_masked_when_registered(
        self, db: AsyncSession,
    ) -> None:
        # The masking contract: registering "password" causes a write of
        # password="hunter2" to log as password="***" — the regression test
        # called out in the task spec.
        register_sensitive_fields(["password"])
        register_audit_listeners()

        w = _Widget(name="hello", password="hunter2")
        db.add(w)
        await db.commit()

        password_row = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.field_name == "password",
            ),
        )).scalar_one()

        assert password_row.new_value == "***"
        assert password_row.old_value is None

        # And the un-registered ``name`` column remains plaintext — masking
        # must not bleed across columns.
        name_row = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.field_name == "name",
            ),
        )).scalar_one()
        assert name_row.new_value == "hello"

    @pytest.mark.asyncio
    async def test_skip_field_omits_row(
        self, db: AsyncSession,
    ) -> None:
        register_skip_fields(["file_content"])
        register_audit_listeners()

        w = _Widget(name="x", file_content="big-binary-blob")
        db.add(w)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.field_name == "file_content",
            ),
        )).scalars().all()
        assert rows == []


class TestListenerUpdate:
    @pytest.mark.asyncio
    async def test_update_captures_old_and_new_values(
        self, db: AsyncSession, listener_attached: None,
    ) -> None:
        w = _Widget(name="before")
        db.add(w)
        await db.commit()

        w.name = "after"
        await db.commit()

        update_rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.operation == "UPDATE",
                AuditLog.field_name == "name",
            ),
        )).scalars().all()
        assert len(update_rows) == 1
        assert update_rows[0].old_value == "before"
        assert update_rows[0].new_value == "after"

    @pytest.mark.asyncio
    async def test_update_to_sensitive_field_masks_both_sides(
        self, db: AsyncSession,
    ) -> None:
        register_sensitive_fields(["password"])
        register_audit_listeners()

        w = _Widget(name="x", password="oldpass")
        db.add(w)
        await db.commit()

        w.password = "newpass"
        await db.commit()

        update_row = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.operation == "UPDATE",
                AuditLog.field_name == "password",
            ),
        )).scalar_one()
        assert update_row.old_value == "***"
        assert update_row.new_value == "***"
        # Plaintext must never leak.
        assert "oldpass" not in (update_row.old_value or "")
        assert "newpass" not in (update_row.new_value or "")


class TestListenerDelete:
    @pytest.mark.asyncio
    async def test_delete_logs_old_values(
        self, db: AsyncSession, listener_attached: None,
    ) -> None:
        w = _Widget(name="doomed")
        db.add(w)
        await db.commit()

        await db.delete(w)
        await db.commit()

        delete_rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.operation == "DELETE",
                AuditLog.field_name == "name",
            ),
        )).scalars().all()
        assert len(delete_rows) == 1
        assert delete_rows[0].old_value == "doomed"
        assert delete_rows[0].new_value is None


class TestSkipTables:
    @pytest.mark.asyncio
    async def test_audit_logs_table_does_not_recurse(
        self, db: AsyncSession, listener_attached: None,
    ) -> None:
        # Inserting an AuditLog directly must not generate audit rows for the
        # audit_logs table itself — the seed default ``audit_logs`` skip-table
        # entry is the recursion guard.
        log = AuditLog(
            table_name="test_widgets",
            record_id="1",
            operation="INSERT",
            field_name="name",
            old_value=None,
            new_value="manual",
        )
        db.add(log)
        await db.commit()

        recursive_rows = (await db.execute(
            select(AuditLog).where(AuditLog.table_name == "audit_logs"),
        )).scalars().all()
        assert recursive_rows == []

    @pytest.mark.asyncio
    async def test_registered_skip_table_is_ignored(
        self, db: AsyncSession,
    ) -> None:
        register_skip_tables(["test_secret_bag"])
        register_audit_listeners()

        bag = _SecretBag(payload="don't-audit-me")
        db.add(bag)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(AuditLog.table_name == "test_secret_bag"),
        )).scalars().all()
        assert rows == []


class TestActorAttribution:
    @pytest.mark.asyncio
    async def test_changed_by_reads_default_contextvar(
        self, db: AsyncSession,
    ) -> None:
        register_audit_listeners()

        token = current_user_id.set("user-abc")
        try:
            db.add(_Widget(name="x"))
            await db.commit()
        finally:
            current_user_id.reset(token)

        rows = (await db.execute(
            select(AuditLog).where(AuditLog.table_name == "test_widgets"),
        )).scalars().all()
        assert rows
        assert all(r.changed_by == "user-abc" for r in rows)

    @pytest.mark.asyncio
    async def test_changed_by_uses_custom_get_actor_callable(
        self, db: AsyncSession,
    ) -> None:
        # Decoupling check: workers / non-HTTP entry points may not have a
        # request ContextVar populated. Passing ``get_actor`` lets the
        # consumer inject its own actor source without touching the shared
        # listener body.
        actor_calls: list[None] = []

        def custom_actor() -> str | None:
            actor_calls.append(None)
            return "worker-task-42"

        register_audit_listeners(get_actor=custom_actor)

        db.add(_Widget(name="y"))
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(AuditLog.table_name == "test_widgets"),
        )).scalars().all()
        assert rows
        assert all(r.changed_by == "worker-task-42" for r in rows)
        # The actor callable was invoked once per audit row written.
        assert len(actor_calls) == len(rows)


class TestCustomAuditLogModel:
    """Apps with a non-shared audit table can pass ``audit_log_model``."""

    @pytest.mark.asyncio
    async def test_custom_model_receives_writes(
        self, db: AsyncSession,
    ) -> None:
        # Use the shared AuditLog as the "custom" type — proves the kwarg path
        # is wired without needing to define a second table in this test file.
        register_audit_listeners(audit_log_model=AuditLog)

        db.add(_Widget(name="z"))
        await db.commit()

        rows = (await db.execute(select(AuditLog))).scalars().all()
        assert any(r.table_name == "test_widgets" for r in rows)


class TestRegistrationHappensBeforeListener:
    """Regression: the registration API must accumulate state SHARED with the
    listener — not a private copy taken at register_audit_listeners() time."""

    @pytest.mark.asyncio
    async def test_late_registration_still_masks(
        self, db: AsyncSession,
    ) -> None:
        # Listener attached BEFORE the field is registered.
        register_audit_listeners()
        # Now an app or test registers a field after the listener is live.
        register_sensitive_fields(["password"])

        db.add(_Widget(name="x", password="leaked"))
        await db.commit()

        password_row = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "test_widgets",
                AuditLog.field_name == "password",
            ),
        )).scalar_one()
        assert password_row.new_value == "***"
