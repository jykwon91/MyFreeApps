"""GET /api/scheduler/status and POST /api/scheduler/trigger/{job_id}.

The scheduler runs in its own service; the API answers from the
``scheduler_job`` table the worker reports into.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.scheduler_constants import JOB_REFRESH_WOW_PRICES, JOB_SYNC_ALL_SOURCES
from app.main import app
from app.models.user.user import User
from app.repositories.system import scheduler_job_repo
from app.schemas.system.scheduled_job_snapshot import ScheduledJobSnapshot


@pytest_asyncio.fixture
async def operator(client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[current_active_user] = lambda: User(email="op@example.com", is_active=True)
    yield client
    app.dependency_overrides.pop(current_active_user, None)


async def _report(db: AsyncSession, *job_ids: str, age: timedelta = timedelta(0)) -> None:
    now = datetime.now(timezone.utc)
    await scheduler_job_repo.replace_snapshot(
        db,
        [ScheduledJobSnapshot(job_id=j, trigger="interval[6:00:00]", next_run_at=now + timedelta(hours=6))
         for j in job_ids],
        now - age,
    )


@pytest.mark.asyncio
async def test_status_reports_the_running_scheduler(operator: AsyncClient, db: AsyncSession) -> None:
    await _report(db, JOB_SYNC_ALL_SOURCES)
    resp = await operator.get("/api/scheduler/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["running"] is True
    assert [(j["id"], j["name"], j["trigger"]) for j in body["jobs"]] == [
        (JOB_SYNC_ALL_SOURCES, JOB_SYNC_ALL_SOURCES, "interval[6:00:00]"),
    ]
    assert body["jobs"][0]["next_run_at"] is not None


@pytest.mark.asyncio
async def test_status_when_the_scheduler_is_down(operator: AsyncClient, db: AsyncSession) -> None:
    await _report(db, JOB_SYNC_ALL_SOURCES, age=timedelta(minutes=10))
    resp = await operator.get("/api/scheduler/status")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"running": False, "jobs": []}


@pytest.mark.asyncio
async def test_trigger_records_the_request(operator: AsyncClient, db: AsyncSession) -> None:
    await _report(db, JOB_SYNC_ALL_SOURCES)
    resp = await operator.post(f"/api/scheduler/trigger/{JOB_SYNC_ALL_SOURCES}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["triggered"] is True
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == [JOB_SYNC_ALL_SOURCES]


@pytest.mark.asyncio
async def test_trigger_unknown_job_is_404(operator: AsyncClient) -> None:
    resp = await operator.post("/api/scheduler/trigger/purge_wow_feature_submissions")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_trigger_a_switched_off_job_is_404(operator: AsyncClient, db: AsyncSession) -> None:
    await _report(db, JOB_SYNC_ALL_SOURCES)
    resp = await operator.post(f"/api/scheduler/trigger/{JOB_REFRESH_WOW_PRICES}")
    assert resp.status_code == 404
    assert "not scheduled" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_trigger_with_the_scheduler_down_is_503(operator: AsyncClient, db: AsyncSession) -> None:
    await _report(db, JOB_SYNC_ALL_SOURCES, age=timedelta(minutes=10))
    resp = await operator.post(f"/api/scheduler/trigger/{JOB_SYNC_ALL_SOURCES}")
    assert resp.status_code == 503
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == []
