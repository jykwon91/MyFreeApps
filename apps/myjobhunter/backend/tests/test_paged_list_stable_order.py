"""Offset-paged lists break ties on id, so rows sharing a sort key are never skipped or repeated.

A refresh inserts a batch of postings in one transaction, so they share ``discovered_at`` and are
all unscored. Without a unique last sort key Postgres may return tied rows in any order, and a
page boundary that falls inside the tie can show one row twice and another never.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.job_analysis.job_analysis import JobAnalysis
from app.repositories.job_analysis import job_analysis_repository

_SAME_MOMENT = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
_ROWS = 12
_PAGE = 5


@pytest.mark.asyncio
async def test_discovered_jobs_with_the_same_sort_key_page_by_id(
    db: AsyncSession, user_factory, as_user, client: AsyncClient,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    jobs = [
        DiscoveredJob(
            user_id=user_id,
            source="jsearch",
            source_external_id=f"tie-{n}",
            title=f"Job {n}",
            company_name="Acme",
            discovered_at=_SAME_MOMENT,
        )
        for n in range(_ROWS)
    ]
    db.add_all(jobs)
    await db.flush()

    paged: list[str] = []
    async with await as_user(user) as a:
        for offset in range(0, _ROWS, _PAGE):
            resp = await a.get("/discover", params={"state": "all", "limit": _PAGE, "offset": offset})
            assert resp.status_code == 200, resp.text
            paged.extend(item["id"] for item in resp.json()["items"])

    assert paged == sorted((str(job.id) for job in jobs), reverse=True)


@pytest.mark.asyncio
async def test_job_analyses_with_the_same_created_at_page_by_id(db: AsyncSession, user_factory) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    analyses = [
        JobAnalysis(
            user_id=user_id,
            jd_text=f"Posting {n}",
            fingerprint=f"{n:064d}",
            verdict="stretch",
            verdict_summary="Some gaps.",
            created_at=_SAME_MOMENT,
        )
        for n in range(_ROWS)
    ]
    db.add_all(analyses)
    await db.flush()

    paged: list[uuid.UUID] = []
    for offset in range(0, _ROWS, _PAGE):
        page = await job_analysis_repository.list_by_user(db, user_id, limit=_PAGE, offset=offset)
        paged.extend(analysis.id for analysis in page)

    assert paged == sorted((analysis.id for analysis in analyses), key=str, reverse=True)
