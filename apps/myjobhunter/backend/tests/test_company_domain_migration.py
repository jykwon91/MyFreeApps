"""The ``compdom261111`` migration normalises stored ``primary_domain`` values.

Rows are inserted with raw SQL (bypassing the model's normalising validator)
to stand in for data written before the fix, then the migration's
normalisation runs against them.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import logging
import uuid
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.company.company import Company

_MIGRATION = (
    Path(__file__).parent.parent / "alembic" / "versions" / "compdom261111_normalize_company_domains.py"
)
_BASE_TIME = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("compdom261111", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _insert_raw(
    engine: AsyncEngine, user_id: uuid.UUID, domain: str | None, *, age_days: int,
) -> uuid.UUID:
    company_id = uuid.uuid4()
    async with engine.begin() as conn:
        await conn.execute(
            insert(Company.__table__).values(
                id=company_id,
                user_id=user_id,
                name=f"Company {company_id.hex[:6]}",
                primary_domain=domain,
                created_at=_BASE_TIME + dt.timedelta(days=age_days),
                updated_at=_BASE_TIME,
            ),
        )
    return company_id


async def _run_migration(engine: AsyncEngine) -> None:
    migration = _load_migration()
    async with engine.begin() as conn:
        await conn.run_sync(migration.normalize_existing_domains)


async def _domains(db: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    result = await db.execute(select(Company.id, Company.primary_domain).where(Company.id.in_(ids)))
    return {row.id: row.primary_domain for row in result}


@pytest.mark.asyncio
async def test_rewrites_non_normalised_domains(
    db: AsyncSession, db_engine: AsyncEngine, user_factory: Callable[..., Any],
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    url = await _insert_raw(db_engine, user_id, "https://www.acme.com/careers", age_days=0)
    trailing = await _insert_raw(db_engine, user_id, "globex.com.", age_days=1)
    clean = await _insert_raw(db_engine, user_id, "initech.com", age_days=2)
    blank = await _insert_raw(db_engine, user_id, "  ", age_days=3)
    unicode_host = await _insert_raw(db_engine, user_id, "bücher.de", age_days=4)
    sharp_s = await _insert_raw(db_engine, user_id, "https://straße.de/", age_days=5)
    full_width = await _insert_raw(db_engine, user_id, "ｗｗｗ.hooli.com。", age_days=6)

    await _run_migration(db_engine)

    assert await _domains(db, [url, trailing, clean, blank, unicode_host, sharp_s, full_width]) == {
        url: "acme.com",
        trailing: "globex.com",
        clean: "initech.com",
        blank: None,
        unicode_host: "xn--bcher-kva.de",
        sharp_s: "xn--strae-oqa.de",
        full_width: "hooli.com",
    }


@pytest.mark.asyncio
async def test_collision_keeps_oldest_and_clears_the_rest(
    db: AsyncSession,
    db_engine: AsyncEngine,
    user_factory: Callable[..., Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    other_user_id = uuid.UUID((await user_factory())["id"])
    # The oldest row is the non-normalised one, and a newer row already holds
    # the normalised value: clearing must happen before the rewrite.
    oldest = await _insert_raw(db_engine, user_id, "https://acme.com/jobs", age_days=0)
    already_clean = await _insert_raw(db_engine, user_id, "acme.com", age_days=1)
    www = await _insert_raw(db_engine, user_id, "www.acme.com", age_days=2)
    other_user = await _insert_raw(db_engine, other_user_id, "www.acme.com", age_days=3)

    with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
        await _run_migration(db_engine)

    assert await _domains(db, [oldest, already_clean, www, other_user]) == {
        oldest: "acme.com",
        already_clean: None,
        www: None,
        other_user: "acme.com",
    }
    # No company row is removed, and every cleared row is recorded.
    count = await db.execute(select(Company.id).where(Company.user_id == user_id))
    assert len(count.all()) == 3
    collisions = [r.getMessage() for r in caplog.records if "collision" in r.getMessage()]
    assert len(collisions) == 2
    assert any(str(already_clean) in m and str(oldest) in m for m in collisions)
    assert any(str(www) in m for m in collisions)


@pytest.mark.asyncio
async def test_unnormalisable_value_is_left_and_logged(
    db: AsyncSession,
    db_engine: AsyncEngine,
    user_factory: Callable[..., Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    junk = await _insert_raw(db_engine, user_id, "see careers page", age_days=0)

    with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
        await _run_migration(db_engine)

    assert await _domains(db, [junk]) == {junk: "see careers page"}
    assert any(str(junk) in r.getMessage() and "not a domain" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_is_idempotent(
    db: AsyncSession, db_engine: AsyncEngine, user_factory: Callable[..., Any],
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    first = await _insert_raw(db_engine, user_id, "https://www.acme.com", age_days=0)
    second = await _insert_raw(db_engine, user_id, "acme.com", age_days=1)

    await _run_migration(db_engine)
    await _run_migration(db_engine)

    assert await _domains(db, [first, second]) == {first: "acme.com", second: None}


@pytest.mark.asyncio
async def test_locks_companies_against_concurrent_writes(db_engine: AsyncEngine) -> None:
    migration = _load_migration()
    async with db_engine.connect() as conn:
        async with conn.begin():
            await conn.run_sync(migration.normalize_existing_domains)
            modes = await conn.execute(
                text(
                    "SELECT mode FROM pg_locks "
                    "WHERE relation = 'companies'::regclass AND pid = pg_backend_pid()"
                ),
            )
            assert "ShareRowExclusiveLock" in set(modes.scalars())
