"""Schema-level tests for the discovery domain.

Verifies:
- All three tables can be created and rows inserted
- Mutual-exclusion constraint fires (dismissed_at vs saved_at)
- Promote consistency constraint fires (promoted_application_id ↔ promoted_at)
- Score range constraint fires
- Source enum constraint rejects unknown adapters
- ``application_events.source`` accepts the new ``discovery`` value
- ``extraction_logs.context_type`` accepts the new ``job_analysis`` value
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.models.system.extraction_log import ExtractionLog


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["id"])


@pytest.mark.asyncio
async def test_discovery_source_create(db: AsyncSession, user_factory):
    user = await user_factory()
    src = DiscoverySource(
        user_id=_uid(user),
        source="jsearch",
        config={"query": "senior backend engineer python remote"},
    )
    db.add(src)
    await db.commit()
    await db.refresh(src)

    assert src.id is not None
    assert src.is_active is True
    assert src.fetch_interval_minutes == 1440
    assert src.consecutive_failures == 0


@pytest.mark.asyncio
async def test_discovery_source_rejects_unknown_kind(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    db.add(DiscoverySource(user_id=_uid(user), source="not_a_real_source"))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_discovery_fetch_links_to_source(db: AsyncSession, user_factory):
    user = await user_factory()
    src = DiscoverySource(user_id=_uid(user), source="remoteok")
    db.add(src)
    await db.commit()
    await db.refresh(src)

    fetch = DiscoveryFetch(
        user_id=_uid(user),
        discovery_source_id=src.id,
        source="remoteok",
        started_at=_now(),
    )
    db.add(fetch)
    await db.commit()
    await db.refresh(fetch)

    assert fetch.status == "running"
    assert fetch.fetched_count == 0


@pytest.mark.asyncio
async def test_discovered_job_create_minimal(db: AsyncSession, user_factory):
    user = await user_factory()
    job = DiscoveredJob(
        user_id=_uid(user),
        source="jsearch",
        source_external_id="abc123",
        title="Senior Backend Engineer",
        company_name="Acme Corp",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    assert job.id is not None
    assert job.remote_type == "unknown"
    assert job.salary_currency == "USD"
    assert job.discovered_at is not None


@pytest.mark.asyncio
async def test_discovered_job_dedup_unique_constraint(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="dup-1",
            title="Job A",
            company_name="Acme",
        ),
    )
    await db.commit()

    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="dup-1",
            title="Job A re-fetch",
            company_name="Acme",
        ),
    )
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_discovered_job_state_mutex_constraint(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    job = DiscoveredJob(
        user_id=_uid(user),
        source="jsearch",
        source_external_id="state-1",
        title="X",
        company_name="Y",
        dismissed_at=_now(),
        saved_at=_now(),
    )
    db.add(job)
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_discovered_job_promote_consistency_constraint(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    company = Company(
        user_id=_uid(user), name="Acme", primary_domain="acme.example.com",
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    app = Application(
        user_id=_uid(user),
        company_id=company.id,
        role_title="Senior Backend Engineer",
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)

    # Setting promoted_application_id but NOT promoted_at must fail.
    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="promote-1",
            title="Z",
            company_name="Acme",
            promoted_application_id=app.id,
            promoted_at=None,
        ),
    )
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_discovered_job_score_range_constraint(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="score-1",
            title="X",
            company_name="Y",
            score=150,  # > 100
        ),
    )
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_application_event_accepts_discovery_source(
    db: AsyncSession, user_factory,
):
    """The chk_appevent_source extension should permit 'discovery'."""
    user = await user_factory()
    company = Company(
        user_id=_uid(user), name="Acme", primary_domain="acme2.example.com",
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    app = Application(
        user_id=_uid(user),
        company_id=company.id,
        role_title="Senior Backend Engineer",
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)

    event = ApplicationEvent(
        user_id=_uid(user),
        application_id=app.id,
        event_type="applied",
        occurred_at=_now(),
        source="discovery",
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    assert event.source == "discovery"


@pytest.mark.asyncio
async def test_extraction_log_accepts_job_analysis_context(
    db: AsyncSession, user_factory,
):
    """The chk_extraction_log_context_type extension should permit
    'job_analysis'."""
    user = await user_factory()
    log = ExtractionLog(
        user_id=_uid(user),
        context_type="job_analysis",
        model="claude-sonnet-4-6",
        status="success",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    assert log.context_type == "job_analysis"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "context_type",
    ["resume_critique", "resume_rewrite", "jd_url_parse"],
)
async def test_extraction_log_accepts_resume_refinement_contexts(
    db: AsyncSession, user_factory, context_type: str,
):
    """The extctx260507 migration permits the resume-refinement and
    JD-URL contexts emitted by critique_service, rewrite_service, and
    jd_url_extractor. Until that migration, these violated
    ``chk_extraction_log_context_type`` and surfaced as 500s once the
    silent-fail in ``_record_log`` was removed (PR #426)."""
    user = await user_factory()
    log = ExtractionLog(
        user_id=_uid(user),
        context_type=context_type,
        model="claude-sonnet-4-6",
        status="success",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    assert log.context_type == context_type


@pytest.mark.asyncio
async def test_inbox_index_query_pattern(db: AsyncSession, user_factory):
    """Smoke-test the partial inbox index by exercising its predicate."""
    user = await user_factory()
    # Active row — should appear in the inbox query.
    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="active-1",
            title="Active",
            company_name="Acme",
            score=85,
        ),
    )
    # Dismissed — should NOT appear.
    db.add(
        DiscoveredJob(
            user_id=_uid(user),
            source="jsearch",
            source_external_id="dismissed-1",
            title="Dismissed",
            company_name="Acme",
            dismissed_at=_now(),
        ),
    )
    await db.commit()

    result = await db.execute(
        select(DiscoveredJob).where(
            DiscoveredJob.user_id == _uid(user),
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
        ),
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].source_external_id == "active-1"
