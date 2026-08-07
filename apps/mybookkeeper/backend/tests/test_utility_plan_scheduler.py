"""Tests for the expiring-utility-plan scheduler task.

The task is read-only: it logs every current plan whose fixed term has lapsed
or is about to, so the condition is visible server-side without anyone opening
the dashboard. What matters here is that it emits at WARNING (so it reaches
journald / Sentry) and that a failure inside it can never abort the cycle that
also runs the Gmail and lease steps.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    SERVICE_TYPE_ELECTRICITY,
)
from app.models.properties.property import Property
from app.repositories.properties import utility_plan_repo
from app.workers.scheduler_worker import flag_expiring_utility_plans

_UOW_TARGET = "app.services.properties.utility_plan_service.unit_of_work"


def _fake_uow_for(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed_expired_plan(db: AsyncSession, name: str) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        address=name,
    )
    db.add(prop)
    await db.flush()
    await utility_plan_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        property_id=prop.id,
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name="Constellation",
        rate_type=RATE_TYPE_FIXED,
        service_start_date=_dt.date(2025, 1, 27),
        term_end_date=_dt.date(2026, 1, 27),
    )


@pytest.mark.asyncio
async def test_logs_a_warning_per_flagged_plan(
    db: AsyncSession, caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_expired_plan(db, "6738 Peerless St")

    with patch(_UOW_TARGET, _fake_uow_for(db)), caplog.at_level(
        logging.WARNING, logger="app.workers.scheduler_worker",
    ):
        count = await flag_expiring_utility_plans()

    assert count == 1
    assert "6738 Peerless St" in caplog.text
    assert "Constellation" in caplog.text


@pytest.mark.asyncio
async def test_quiet_when_nothing_needs_renewal(
    db: AsyncSession, caplog: pytest.LogCaptureFixture,
) -> None:
    with patch(_UOW_TARGET, _fake_uow_for(db)), caplog.at_level(
        logging.WARNING, logger="app.workers.scheduler_worker",
    ):
        count = await flag_expiring_utility_plans()

    assert count == 0
    assert caplog.text == ""


@pytest.mark.asyncio
async def test_a_failure_does_not_abort_the_cycle() -> None:
    """A DB outage here must not take the Gmail and lease steps down with it."""
    with patch(
        "app.workers.scheduler_worker.utility_plan_service."
        "sweep_plans_needing_renewal",
        new_callable=AsyncMock,
        side_effect=RuntimeError("database is on fire"),
    ):
        assert await flag_expiring_utility_plans() == 0
