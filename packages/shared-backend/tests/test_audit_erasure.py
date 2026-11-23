"""Deleting an account erases its content from ``audit_logs``, and nobody else's.

Drives the real audit listener and the real deletion steps the shared
``DELETE /users/me`` route runs, against an app-shaped schema on SQLite: a
personal table, a child table without ``user_id``, an app-wide table that only
loses its link to the user (SET NULL), and MBK-style workspaces whose child
table has no ``organization_id`` of its own.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy import ForeignKey, String, delete, event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.core.account_deleted_by import AccountDeletedBy
from platform_shared.core.audit import register_audit_listeners
from platform_shared.core.audit_config import AuditConfig
from platform_shared.core.audit_erasure_constants import (
    ERASED_AUDIT_VALUE,
    MASKED_AUDIT_VALUE,
)
from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.repositories.deletion_scope_repo import workspace_tables
from platform_shared.services.account_deletion import delete_account
from platform_shared.services.audit_erasure import (
    capture_deletion_scope,
    erase_audit_history,
)
from platform_shared.testing.audit_erasure import (
    assert_audit_erased,
    audit_values,
    write_as,
)


class _AppBase(DeclarativeBase):
    pass


class _User(_AppBase):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(100))
    display_name: Mapped[str] = mapped_column(String(100))


class _Note(_AppBase):
    __tablename__ = "notes"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(200))
    pin: Mapped[str | None] = mapped_column(String(20))


class _NoteTag(_AppBase):
    __tablename__ = "note_tags"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(200))


class _Setting(_AppBase):
    __tablename__ = "app_settings"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    value: Mapped[str] = mapped_column(String(200))


class _Organization(_AppBase):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))


class _OrgRecord(_AppBase):
    __tablename__ = "org_records"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    memo: Mapped[str] = mapped_column(String(200))


class _OrgRecordNote(_AppBase):
    """A workspace record's child, with no ``organization_id`` of its own (like MBK's lease files)."""

    __tablename__ = "org_record_notes"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    record_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("org_records.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(200))


@pytest_asyncio.fixture()
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    event.listen(engine.sync_engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_AppBase.metadata.create_all)
    register_audit_listeners(
        AuditConfig(sensitive_fields=frozenset({"pin"}), skip_tables=frozenset(), skip_fields=frozenset()),
        base=_AppBase,
    )
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


async def test_deleting_an_account_erases_its_audit_content_only(db: AsyncSession) -> None:
    alice = _User(email="alice@example.com", display_name="Alice Erased")
    bob = _User(email="bob@example.com", display_name="Bob Kept")
    await write_as(db, alice, alice)
    await write_as(db, bob, bob)

    # Alice's own note, edited by a background worker (no actor) and by Bob too.
    note = _Note(user_id=alice.id, body="alice private note", pin="1234")
    await write_as(db, alice, note)
    await write_as(db, alice, _NoteTag(note_id=note.id, label="alice tag on child"))
    note.body = "worker rewrote alice note"
    await write_as(db, None)
    note.body = "bob rewrote alice note"
    await write_as(db, bob)
    old_note = _Note(user_id=alice.id, body="alice note deleted long ago")
    await write_as(db, alice, old_note)
    await db.delete(old_note)
    await write_as(db, alice)

    # Rows that survive Alice: Bob's note and an app-wide setting, both of which she edited.
    bobs_note = _Note(user_id=bob.id, body="bob own note")
    await write_as(db, bob, bobs_note)
    bobs_note.body = "alice edit on bob note"
    await write_as(db, alice)
    setting = _Setting(updated_by=alice.id, value="alice set app setting")
    await write_as(db, alice, setting)

    # Bob's workspace: Alice edits a record, and adds a child note that Bob later deletes.
    bobs_org = _Organization(created_by=bob.id, name="bob workspace")
    await write_as(db, bob, bobs_org)
    shared = _OrgRecord(organization_id=bobs_org.id, created_by=bob.id, memo="bob shared memo")
    await write_as(db, bob, shared)
    shared.memo = "alice edit on bob workspace"
    await write_as(db, alice)
    child = _OrgRecordNote(record_id=shared.id, text="alice note in bob workspace, since deleted")
    await write_as(db, alice, child)
    await db.delete(child)
    await write_as(db, bob)

    alices_org = _Organization(created_by=alice.id, name="alice workspace")
    await write_as(db, alice, alices_org)
    await write_as(db, bob, _OrgRecord(organization_id=alices_org.id, created_by=bob.id, memo="bob memo in alice workspace"))
    await db.commit()
    audit_rows_before = len((await db.execute(select(AuditLog.id))).all())

    scope = await capture_deletion_scope(db, alice)
    # An app's prepare_deletion removing the workspace the user created, as MBK's does.
    await db.execute(delete(_Organization).where(_Organization.id == alices_org.id))
    await delete_account(db, alice, request=None, metadata={"by": AccountDeletedBy.SELF, "actor_id": str(alice.id)})
    await erase_audit_history(db, alice, scope)
    await db.commit()

    values = await audit_values(db)
    assert_audit_erased(
        values,
        erased=[
            "alice@example.com", "Alice Erased", "alice private note", "alice tag on child",
            "worker rewrote alice note", "bob rewrote alice note", "alice note deleted long ago",
            "alice workspace", "bob memo in alice workspace",
        ],
        kept=[
            "bob@example.com", "Bob Kept", "bob own note", "alice edit on bob note", "alice set app setting",
            "bob workspace", "bob shared memo", "alice edit on bob workspace",
            "alice note in bob workspace, since deleted",
        ],
    )
    assert MASKED_AUDIT_VALUE in values, "a masked value stays masked, not erased"

    snapshot = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "users", AuditLog.record_id == str(alice.id),
            AuditLog.operation == "DELETE", AuditLog.field_name == "email",
        ),
    )).scalar_one()
    assert snapshot.old_value == ERASED_AUDIT_VALUE
    assert snapshot.new_value is None
    pins = (await db.execute(
        select(AuditLog.new_value).where(AuditLog.table_name == "notes", AuditLog.field_name == "pin"),
    )).scalars().all()
    assert pins == [MASKED_AUDIT_VALUE]
    assert len((await db.execute(select(AuditLog.id))).all()) > audit_rows_before


def test_workspace_tables_follow_foreign_keys_down_from_the_workspace() -> None:
    assert workspace_tables(_AppBase.metadata) == {"organizations", "org_records", "org_record_notes"}
