"""Account erasure finds a user's audit rows through an index, in every app.

``audit_logs`` only grows. Erasure looks rows up by ``changed_by``
(:mod:`platform_shared.repositories.audit_log_repo`), so without an index
leading on that column every account deletion reads the whole table. These
tests hold the shared model to that index, check on SQLite that the real erasure
queries use it, and check every app's migrations (and the scaffold new apps start from)
create each index the model declares.
"""
from __future__ import annotations

import re
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from platform_shared.db.models.audit_log import AuditLog
from platform_shared.repositories.audit_log_repo import authored_records, erase_authored

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ERASURE_INDEX = "ix_audit_changed_by_record"
_ERASURE_COLUMNS = ["changed_by", "table_name", "record_id"]

# Apps whose audit_logs still lack an index the model declares. The owner has
# put mygamingassistant off-limits for now; it needs the same migration as the
# other apps. Remove it here when that lands (the last test below insists).
_MIGRATION_PENDING = {"mygamingassistant": {_ERASURE_INDEX}}


def _versions_dirs() -> dict[str, Path]:
    dirs = {
        path.parents[2].name: path
        for path in sorted(_REPO_ROOT.glob("apps/*/backend/alembic/versions"))
        if any("audit_logs" in f.read_text(encoding="utf-8") for f in path.glob("*.py"))
    }
    dirs["scaffold"] = _REPO_ROOT / "infra/templates/scaffold/backend/alembic/versions"
    return dirs


def _created_indexes(versions: Path) -> set[str]:
    source = "\n".join(f.read_text(encoding="utf-8") for f in versions.glob("*.py"))
    return set(re.findall(r'create_index\(\s*"(\w+)"', source)) | set(
        re.findall(r"CREATE INDEX (\w+) ON audit_logs", source),
    )


_VERSIONS = _versions_dirs()
_MODEL_INDEXES = {index.name for index in AuditLog.__table__.indexes}


def test_model_indexes_erasure_lookups() -> None:
    index = next((i for i in AuditLog.__table__.indexes if i.name == _ERASURE_INDEX), None)
    assert index is not None, f"AuditLog must declare {_ERASURE_INDEX}"
    assert [c.name for c in index.columns] == _ERASURE_COLUMNS


@pytest_asyncio.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(AuditLog.__table__.create)
    yield engine
    await engine.dispose()


async def test_erasure_queries_use_the_index(engine: AsyncEngine) -> None:
    statements: list[tuple[str, tuple[object, ...]]] = []

    def capture(_conn, _cursor, statement, parameters, _context, _many) -> None:
        if "audit_logs" in statement:
            statements.append((statement, tuple(parameters)))

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    async with async_sessionmaker(engine, class_=AsyncSession)() as db:
        await authored_records(db, "user-1", except_tables={"users"})
        await erase_authored(db, "user-1", "notes", ["n1", "n2"])
    event.remove(engine.sync_engine, "before_cursor_execute", capture)

    assert len(statements) == 2
    async with engine.connect() as conn:
        for statement, parameters in statements:
            plan = (await conn.exec_driver_sql(f"EXPLAIN QUERY PLAN {statement}", parameters)).all()
            details = " ".join(row[-1] for row in plan)
            assert _ERASURE_INDEX in details, f"{statement!r} does not use {_ERASURE_INDEX}: {details}"


@pytest.mark.parametrize("app", sorted(_VERSIONS))
def test_migrations_create_every_model_index(app: str) -> None:
    missing = _MODEL_INDEXES - _created_indexes(_VERSIONS[app]) - _MIGRATION_PENDING.get(app, set())
    assert not missing, f"{app}'s alembic migrations never create {sorted(missing)} on audit_logs"


@pytest.mark.parametrize("app", sorted(_MIGRATION_PENDING))
def test_pending_apps_are_still_pending(app: str) -> None:
    landed = _MIGRATION_PENDING[app] & _created_indexes(_VERSIONS[app])
    assert not landed, f"{app} now creates {sorted(landed)}: remove it from _MIGRATION_PENDING"
