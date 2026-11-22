"""Tests for platform_shared.core.audit.

Exercises the configuration API and the SQLAlchemy after_flush listener against
a fresh in-memory SQLite database — no MBK / MJH fixtures referenced. The
shared module is the contract; consumer apps pass their own ``AuditConfig``.
"""
from __future__ import annotations

import dataclasses
import inspect as pyinspect
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import Integer, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.core.audit import (
    AuditConfigurationError,
    attached_audit_config,
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
    registered_audit_config,
    reset_registry,
    verify_audit_config,
)
from platform_shared.core.audit_config import AuditConfig
from platform_shared.core.encrypted_string_type import EncryptedString, PIICodec
from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog


def _config(
    *,
    sensitive: tuple[str, ...] = (),
    skip_tables: tuple[str, ...] = (),
    skip_fields: tuple[str, ...] = (),
) -> AuditConfig:
    return AuditConfig(
        sensitive_fields=frozenset(sensitive),
        skip_tables=frozenset(skip_tables),
        skip_fields=frozenset(skip_fields),
    )


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


class _IsolatedBase(DeclarativeBase):
    """Kept off the shared ``Base`` so the encrypted column below doesn't make
    every other test's verification fail."""


_IDENTITY_CODEC = PIICodec(encrypt=lambda v: v, decrypt=lambda v: v)


class _Diary(_IsolatedBase):
    """A table with an encrypted column, for the encrypted-column check."""
    __tablename__ = "test_diary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(100))
    entry_text: Mapped[str] = mapped_column(EncryptedString(1000, codec=_IDENTITY_CODEC))


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
    """Attach the listener with an empty configuration for the test."""
    register_audit_listeners(_config())


class TestConfigIsRequired:
    """The listener cannot be attached without the app's masking configuration
    — the regression where app.core.audit stopped being imported left the
    listener attached with nothing registered, and secrets went to audit_logs
    in cleartext."""

    def test_register_without_config_is_a_type_error(self) -> None:
        with pytest.raises(TypeError):
            register_audit_listeners()  # type: ignore[call-arg]
        assert attached_audit_config() is None

    def test_config_parameter_is_required_and_typed(self) -> None:
        param = pyinspect.signature(register_audit_listeners).parameters["config"]
        assert param.default is pyinspect.Parameter.empty
        assert param.annotation in (AuditConfig, "AuditConfig")

    def test_config_fields_are_all_required(self) -> None:
        with pytest.raises(TypeError):
            AuditConfig()  # type: ignore[call-arg]
        with pytest.raises(TypeError):
            AuditConfig(sensitive_fields=frozenset({"password"}))  # type: ignore[call-arg]
        assert all(
            f.default is dataclasses.MISSING and f.default_factory is dataclasses.MISSING
            for f in dataclasses.fields(AuditConfig)
        )

    def test_config_is_immutable(self) -> None:
        config = _config(sensitive=("password",))
        with pytest.raises(dataclasses.FrozenInstanceError):
            config.sensitive_fields = frozenset()  # type: ignore[misc]


class TestRegistration:
    def test_attached_config_is_the_one_passed(self) -> None:
        config = _config(sensitive=("password",), skip_tables=("test_secret_bag",))
        register_audit_listeners(config)
        assert attached_audit_config() == config

    def test_same_config_again_is_a_no_op(self) -> None:
        config = _config(sensitive=("password",))
        register_audit_listeners(config)
        register_audit_listeners(_config(sensitive=("password",)))
        assert attached_audit_config() == config

    def test_a_different_config_is_refused(self) -> None:
        register_audit_listeners(_config(sensitive=("password",)))
        with pytest.raises(AuditConfigurationError):
            register_audit_listeners(_config())
        assert attached_audit_config() == _config(sensitive=("password",))

    def test_reset_registry_detaches(self) -> None:
        register_audit_listeners(_config())
        reset_registry()
        assert attached_audit_config() is None


class TestLegacyRegistry:
    """MGA still registers its sets at import time (see the module docstring)."""

    def test_empty_registry_refuses_to_build_a_config(self) -> None:
        with pytest.raises(AuditConfigurationError) as exc:
            registered_audit_config()
        assert "audit_config" in str(exc.value)

    def test_registered_sets_become_the_config(self) -> None:
        register_sensitive_fields(["password"])
        register_skip_tables(["test_secret_bag"])
        register_skip_fields(["file_content"])
        assert registered_audit_config() == _config(
            sensitive=("password",), skip_tables=("test_secret_bag",), skip_fields=("file_content",),
        )

    def test_reset_registry_clears_the_registry(self) -> None:
        register_sensitive_fields(["password"])
        reset_registry()
        with pytest.raises(AuditConfigurationError):
            registered_audit_config()


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
        register_audit_listeners(_config(sensitive=("password",)))

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
        register_audit_listeners(_config(skip_fields=("file_content",)))

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
        register_audit_listeners(_config(sensitive=("password",)))

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
        # audit_logs table itself — the audit model's own table is always
        # skipped (recursion guard).
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
        register_audit_listeners(_config(skip_tables=("test_secret_bag",)))

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
        register_audit_listeners(_config())

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

        register_audit_listeners(_config(), get_actor=custom_actor)

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
        register_audit_listeners(_config(), audit_log_model=AuditLog)

        db.add(_Widget(name="z"))
        await db.commit()

        rows = (await db.execute(select(AuditLog))).scalars().all()
        assert any(r.table_name == "test_widgets" for r in rows)


class TestSensitiveFieldNameValidation:
    """Startup sanity check — a sensitive name that doesn't match any ORM
    column means the mask silently never fires. This is the typo class that
    leaked plaintext TOTP secrets into audit_logs in MJH + MGA. The verifier
    catches it at boot instead of letting plaintext leak in production.
    """

    def test_passes_when_all_names_match_columns(self) -> None:
        verify_audit_config(_config(sensitive=("password", "secret_token")))  # no raise

    def test_passes_with_no_sensitive_fields(self) -> None:
        verify_audit_config(_config())

    def test_raises_on_typo(self) -> None:
        # 'totp_secret_encrypted' is the actual typo that shipped in MJH/MGA;
        # the real column on those User models is 'totp_secret'.
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(_config(sensitive=("password", "totp_secret_encrypted")))
        msg = str(exc.value)
        assert "totp_secret_encrypted" in msg
        assert "'password'" not in msg
        assert "audit_logs" in msg
        assert "Check spelling" in msg

    def test_register_audit_listeners_refuses_to_attach_on_typo(self) -> None:
        with pytest.raises(AuditConfigurationError):
            register_audit_listeners(_config(sensitive=("nonexistent_field",)))
        # Listener must NOT have attached when verification failed.
        assert attached_audit_config() is None

    def test_unknown_names_listed_sorted_for_deterministic_messages(self) -> None:
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(_config(sensitive=("zzz_unknown", "aaa_unknown", "mmm_unknown")))
        msg = str(exc.value)
        assert msg.index("'aaa_unknown'") < msg.index("'mmm_unknown'") < msg.index("'zzz_unknown'")


class TestEncryptedColumnsMustBeMasked:
    """The listener reads the DECRYPTED attribute value, so an EncryptedString
    column missing from the sensitive fields lands in audit_logs as cleartext.
    Verification must refuse to boot instead.
    """

    def test_raises_when_encrypted_column_is_not_masked(self) -> None:
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(_config(), base=_IsolatedBase)
        msg = str(exc.value)
        assert "test_diary.entry_text" in msg
        # Plain String columns are not the verifier's business.
        assert "title" not in msg

    def test_register_audit_listeners_refuses_to_attach(self) -> None:
        with pytest.raises(AuditConfigurationError):
            register_audit_listeners(_config(), base=_IsolatedBase)
        assert attached_audit_config() is None

    def test_passes_when_encrypted_column_is_masked(self) -> None:
        verify_audit_config(_config(sensitive=("entry_text",)), base=_IsolatedBase)

    def test_passes_when_encrypted_column_is_skipped(self) -> None:
        verify_audit_config(_config(skip_fields=("entry_text",)), base=_IsolatedBase)

    def test_passes_when_table_is_skipped(self) -> None:
        verify_audit_config(_config(skip_tables=("test_diary",)), base=_IsolatedBase)
