"""Migration ``0008`` masks secrets already in audit_logs, and nothing else.

Rows are inserted with raw SQL to stand in for what the audit listener wrote
while it ran with no masking configuration, then the migration's repair runs.
"""
from __future__ import annotations

import importlib.util
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from types import ModuleType

import pytest
import pytest_asyncio
from platform_shared.core.audit_erasure_constants import MASKED_AUDIT_VALUE
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

_MIGRATION = Path(__file__).parent.parent / "alembic" / "versions" / "0008_mask_audit_log_secrets.py"
_MASK = MASKED_AUDIT_VALUE

# (table, operation, field, old_value, new_value) as written without masking.
_ROWS = [
    ("users", "UPDATE", "totp_secret", "OLDSECRET", "NEWSECRET"),
    ("users", "INSERT", "hashed_password", None, "$argon2id$hash"),
    ("users", "UPDATE", "totp_recovery_codes", '["a-b"]', None),
    ("refresh_sessions", "INSERT", "token_hash", None, "deadbeef"),
    ("users", "UPDATE", "email", "old@example.com", "new@example.com"),
    ("users", "UPDATE", "totp_secret", _MASK, _MASK),
    ("users", "UPDATE", "totp_secret", None, None),
]
_EXPECTED = [
    (_MASK, _MASK),
    (None, _MASK),
    (_MASK, None),
    (None, _MASK),
    ("old@example.com", "new@example.com"),
    (_MASK, _MASK),
    (None, None),
]


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("audit_mask_migration", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest_asyncio.fixture()
async def engine() -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture()
async def audit_rows(engine: AsyncEngine) -> AsyncGenerator[str, None]:
    record_id = f"migration-test-{uuid.uuid4()}"
    async with engine.begin() as conn:
        for table, operation, field, old, new in _ROWS:
            await conn.execute(
                text(
                    "INSERT INTO audit_logs (table_name, record_id, operation, field_name, "
                    "old_value, new_value) VALUES (:t, :r, :o, :f, :old, :new)"
                ),
                {"t": table, "r": record_id, "o": operation, "f": field, "old": old, "new": new},
            )
    yield record_id
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM audit_logs WHERE record_id = :r"), {"r": record_id})


async def _values(engine: AsyncEngine, record_id: str) -> list[tuple[str | None, str | None]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT old_value, new_value FROM audit_logs WHERE record_id = :r ORDER BY id"),
            {"r": record_id},
        )
        return [(row.old_value, row.new_value) for row in rows]


@pytest.mark.asyncio
async def test_masks_secrets_and_keeps_the_rows(engine: AsyncEngine, audit_rows: str) -> None:
    migration = _load_migration()
    async with engine.begin() as conn:
        await conn.run_sync(migration.mask_audit_log_secrets)

    assert await _values(engine, audit_rows) == _EXPECTED


@pytest.mark.asyncio
async def test_running_again_changes_nothing(engine: AsyncEngine, audit_rows: str) -> None:
    migration = _load_migration()
    for _ in range(2):
        async with engine.begin() as conn:
            await conn.run_sync(migration.mask_audit_log_secrets)

    assert await _values(engine, audit_rows) == _EXPECTED
