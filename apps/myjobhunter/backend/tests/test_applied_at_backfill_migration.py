"""The ``appliedat261119`` migration fills empty ``applied_at`` from the event log.

Applications are inserted with ``applied_at`` NULL to stand in for rows the add
form saved before it sent one, then the migration's backfill runs against them.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import uuid
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company

_MIGRATION = (
    Path(__file__).parent.parent / "alembic" / "versions" / "appliedat261119_backfill_applied_at.py"
)
_ADDED = dt.datetime(2026, 3, 10, 15, 30, tzinfo=dt.timezone.utc)
_BACKDATED = dt.datetime(2026, 2, 24, tzinfo=dt.timezone.utc)
_ENTERED = dt.datetime(2026, 1, 5, tzinfo=dt.timezone.utc)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("appliedat261119", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _application(
    db: AsyncSession,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    *,
    applied_at: dt.datetime | None,
    events: list[tuple[str, dt.datetime]],
) -> uuid.UUID:
    application = Application(user_id=user_id, company_id=company_id, role_title=f"Engineer {uuid.uuid4().hex[:8]}", applied_at=applied_at)
    db.add(application)
    await db.flush()
    for event_type, occurred_at in events:
        db.add(
            ApplicationEvent(
                user_id=user_id,
                application_id=application.id,
                event_type=event_type,
                occurred_at=occurred_at,
                source="system",
            ),
        )
    await db.flush()
    return application.id


async def _applied_at(db: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, dt.datetime | None]:
    result = await db.execute(select(Application.id, Application.applied_at).where(Application.id.in_(ids)))
    return {row.id: row.applied_at for row in result}


@pytest.mark.asyncio
async def test_fills_only_empty_applied_at_from_the_earliest_applied_event(
    db: AsyncSession, db_engine: AsyncEngine, user_factory: Callable[..., Any],
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    company = Company(user_id=user_id, name="Acme")
    db.add(company)
    await db.flush()

    # Added by hand: only the "applied" event stamped when it was added, then a rejection.
    hand_added = await _application(
        db, user_id, company.id, applied_at=None,
        events=[("applied", _ADDED), ("rejected", _ADDED + dt.timedelta(days=5))],
    )
    # Backdated by logging an earlier "Applied" by hand: that earlier day wins.
    backdated = await _application(
        db, user_id, company.id, applied_at=None,
        events=[("applied", _ADDED), ("applied", _BACKDATED)],
    )
    # Already dated: left as entered.
    entered = await _application(
        db, user_id, company.id, applied_at=_ENTERED, events=[("applied", _ADDED)],
    )
    # No "applied" event to go by: left empty.
    no_event = await _application(
        db, user_id, company.id, applied_at=None, events=[("interview_scheduled", _ADDED)],
    )
    await db.commit()

    migration = _load_migration()
    async with db_engine.begin() as conn:
        await conn.run_sync(migration.backfill_applied_at)

    assert await _applied_at(db, [hand_added, backdated, entered, no_event]) == {
        hand_added: _ADDED,
        backdated: _BACKDATED,
        entered: _ENTERED,
        no_event: None,
    }
