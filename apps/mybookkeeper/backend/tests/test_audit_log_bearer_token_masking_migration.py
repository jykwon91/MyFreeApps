"""Migration ``audittokens261123`` masks bearer tokens already in audit_logs, and nothing else.

Rows are inserted with raw SQL to stand in for what the audit listener wrote
before these columns were sensitive, then the migration's repair runs. It runs
on the in-memory SQLite database every test uses and, when
``MBK_TEST_POSTGRES_URL`` names an asyncpg URL of a database migrated with
``alembic upgrade head``, on Postgres too, where ``trg_audit_log_immutable``
must let the masking through. Each run happens inside a transaction that is
rolled back, so neither database keeps the rows (the trigger refuses DELETE).
"""
from __future__ import annotations

import importlib.util
import os
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType

import pytest
import pytest_asyncio
from platform_shared.core.audit_erasure_constants import (
    ERASED_AUDIT_VALUE,
    MASKED_AUDIT_VALUE,
)
from sqlalchemy import DateTime, bindparam, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

_MIGRATION = (
    Path(__file__).parent.parent / "alembic" / "versions" / "audittokens261123_mask_audit_log_bearer_tokens.py"
)
_POSTGRES_URL = os.environ.get("MBK_TEST_POSTGRES_URL")
_MASK = MASKED_AUDIT_VALUE

# (table, operation, field, old_value, new_value) as written without masking.
_ROWS = [
    ("organization_invites", "INSERT", "token", None, "invite-token"),
    ("welcome_manuals", "UPDATE", "share_token", "old-share", "new-share"),
    ("channel_listings", "INSERT", "ical_export_token", None, "export-token"),
    ("channel_listings", "UPDATE", "ical_import_secret_token", "import-secret", None),
    ("channel_listings", "UPDATE", "ical_import_url", None, "https://airbnb.example/ical.ics?s=secret"),
    # Not secrets: the same tables' other columns, and a ``token`` column of another table.
    ("organization_invites", "INSERT", "email", None, "invitee@example.com"),
    ("channel_listings", "UPDATE", "external_url", "https://a.example/1", "https://a.example/2"),
    ("users", "UPDATE", "token", "keep-old", "keep-new"),
    # Already masked, NULL, and erased values stay as they are.
    ("welcome_manuals", "UPDATE", "share_token", _MASK, _MASK),
    ("organization_invites", "UPDATE", "token", None, None),
    ("organization_invites", "UPDATE", "token", ERASED_AUDIT_VALUE, "invite-token"),
]
_EXPECTED = [
    (None, _MASK),
    (_MASK, _MASK),
    (None, _MASK),
    (_MASK, None),
    (None, _MASK),
    (None, "invitee@example.com"),
    ("https://a.example/1", "https://a.example/2"),
    ("keep-old", "keep-new"),
    (_MASK, _MASK),
    (None, None),
    (ERASED_AUDIT_VALUE, _MASK),
]


_INSERT = text(
    "INSERT INTO audit_logs (table_name, record_id, operation, field_name, "
    "old_value, new_value, changed_at) VALUES (:t, :r, :o, :f, :old, :new, :at)"
).bindparams(bindparam("at", type_=DateTime(timezone=True)))


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("audit_bearer_token_migration", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest_asyncio.fixture(params=["sqlite", "postgres"])
async def conn(request: pytest.FixtureRequest, _db_engine: AsyncEngine) -> AsyncGenerator[AsyncConnection, None]:
    """A connection whose every write is rolled back at the end."""
    if request.param == "postgres":
        if not _POSTGRES_URL:
            pytest.skip("MBK_TEST_POSTGRES_URL isn't set")
        engine = create_async_engine(_POSTGRES_URL)
    else:
        engine = _db_engine
    try:
        async with engine.connect() as connection:
            outer = await connection.begin()
            try:
                yield connection
            finally:
                await outer.rollback()
    finally:
        if engine is not _db_engine:
            await engine.dispose()


async def _insert_rows(conn: AsyncConnection) -> str:
    record_id = f"migration-test-{uuid.uuid4()}"
    for table, operation, field, old, new in _ROWS:
        await conn.execute(
            _INSERT,
            {"t": table, "r": record_id, "o": operation, "f": field, "old": old, "new": new, "at": datetime.now(UTC)},
        )
    return record_id


async def _values(conn: AsyncConnection, record_id: str) -> list[tuple[str | None, str | None]]:
    rows = await conn.execute(
        text("SELECT old_value, new_value FROM audit_logs WHERE record_id = :r ORDER BY id"),
        {"r": record_id},
    )
    return [(row.old_value, row.new_value) for row in rows]


@pytest.mark.asyncio
async def test_masks_bearer_tokens_and_keeps_the_rows(conn: AsyncConnection) -> None:
    record_id = await _insert_rows(conn)

    await conn.run_sync(_load_migration().mask_audit_log_bearer_tokens)

    assert await _values(conn, record_id) == _EXPECTED


@pytest.mark.asyncio
async def test_running_again_changes_nothing(conn: AsyncConnection) -> None:
    record_id = await _insert_rows(conn)
    migration = _load_migration()

    for _ in range(2):
        await conn.run_sync(migration.mask_audit_log_bearer_tokens)

    assert await _values(conn, record_id) == _EXPECTED
