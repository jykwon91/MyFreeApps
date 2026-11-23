"""Rows for the audited-write tests, each with real parents (the test database enforces foreign keys)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.models.company.research_source import ResearchSource
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.models.resume_refinement.session import ResumeRefinementSession
from app.models.user.user import User

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
LONG_AGO = datetime(2026, 1, 1, tzinfo=UTC)


async def _add[RowT](db: AsyncSession, row: RowT) -> RowT:
    db.add(row)
    await db.flush()
    return row


async def user(db: AsyncSession) -> User:
    return await _add(db, User(
        email=f"audited-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    ))


async def company(db: AsyncSession, *, research_started_at: datetime | None = None) -> Company:
    owner = await user(db)
    return await _add(db, Company(
        user_id=owner.id, name="Acme", research_started_at=research_started_at, updated_at=LONG_AGO,
    ))


async def application(db: AsyncSession) -> Application:
    parent = await company(db)
    return await _add(db, Application(user_id=parent.user_id, company_id=parent.id, role_title="Engineer"))


async def application_event(db: AsyncSession, parent: Application) -> ApplicationEvent:
    return await _add(db, ApplicationEvent(
        user_id=parent.user_id, application_id=parent.id, event_type="applied", occurred_at=NOW, source="manual",
    ))


async def research_source(db: AsyncSession) -> ResearchSource:
    parent = await company(db)
    research = await _add(db, CompanyResearch(
        user_id=parent.user_id, company_id=parent.id, overall_sentiment="mixed",
        red_flags=[], green_flags=[], comp_currency="USD", comp_confidence="unknown",
    ))
    return await _add(db, ResearchSource(
        user_id=parent.user_id, company_research_id=research.id,
        url="https://example.com/review", source_type="glassdoor", fetched_at=NOW,
    ))


async def discovery_fetch(
    db: AsyncSession, *, owner: User | None = None, status: str = "success", started_at: datetime = NOW,
) -> DiscoveryFetch:
    owner = owner or await user(db)
    source = await _add(db, DiscoverySource(user_id=owner.id, source="jsearch", config={}))
    return await _add(db, DiscoveryFetch(
        user_id=owner.id, discovery_source_id=source.id, source="jsearch", started_at=started_at, status=status,
    ))


async def discovered_job(
    db: AsyncSession, *, promoted_to: Application | None = None, expired_at: datetime | None = None,
) -> DiscoveredJob:
    if promoted_to is not None:
        owner_id = promoted_to.user_id
        fetch_id = None
    else:
        fetch = await discovery_fetch(db)
        owner_id = fetch.user_id
        fetch_id = fetch.id
    return await _add(db, DiscoveredJob(
        user_id=owner_id,
        source="jsearch",
        source_external_id=f"job-{uuid.uuid4().hex[:8]}",
        fetch_id=fetch_id,
        title="Backend Engineer",
        company_name="Acme",
        remote_type="remote",
        expired_at=expired_at,
        promoted_application_id=promoted_to.id if promoted_to is not None else None,
        promoted_at=NOW if promoted_to is not None else None,
    ))


async def preparing_session(
    db: AsyncSession, *, preparation_started_at: datetime | None = None,
) -> ResumeRefinementSession:
    owner = await user(db)
    return await _add(db, ResumeRefinementSession(
        user_id=owner.id, status="preparing", current_draft="My draft",
        preparation_started_at=preparation_started_at,
    ))
