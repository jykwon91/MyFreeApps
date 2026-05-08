"""Tests for discovery_promote_service.promote_discovered_job.

Covers:
- Happy path: Application + ApplicationEvent + company created; job marked promoted.
- Idempotent re-promote: second call returns the existing Application.
- Find-or-create company: missing company is created; existing company is reused.
- Source mapping: every publisher in PUBLISHER_TO_SOURCE maps correctly.
- Unknown publisher falls through to "direct".
- Cross-tenant: job owned by another user raises DiscoveryPromoteError.

Uses real DB fixtures (conftest.py) so the full ORM stack is exercised.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PUBLISHER_TO_SOURCE
from app.models.company.company import Company
from app.models.discovery.discovered_job import DiscoveredJob
from app.services.discovery.discovery_promote_service import (
    DiscoveryPromoteError,
    promote_discovered_job,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_discovered_job(user_id: uuid.UUID, **overrides) -> DiscoveredJob:
    base = dict(
        user_id=user_id,
        source="jsearch",
        source_external_id=str(uuid.uuid4()),
        title="Senior Backend Engineer",
        company_name="Acme Corp",
        remote_type="remote",
        source_publisher="LinkedIn",
        salary_currency="USD",
    )
    base.update(overrides)
    return DiscoveredJob(**base)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestPromoteHappyPath:
    @pytest.mark.asyncio
    async def test_creates_application_and_event(
        self, user_factory, as_user, db: AsyncSession,
    ) -> None:
        """promote_discovered_job creates an Application + initial ApplicationEvent."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        job = _make_discovered_job(user_id)
        db.add(job)
        await db.flush()

        application = await promote_discovered_job(db, user_id, job.id)

        assert application.user_id == user_id
        assert application.role_title == "Senior Backend Engineer"
        assert application.source == "linkedin"
        assert application.posted_salary_currency == "USD"
        assert application.remote_type == "remote"

        # Job row should be marked as promoted.
        await db.refresh(job)
        assert job.promoted_application_id == application.id
        assert job.promoted_at is not None
        assert job.saved_at is None

    @pytest.mark.asyncio
    async def test_creates_company_when_missing(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """promote_discovered_job creates a Company when none exists."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        job = _make_discovered_job(user_id, company_name="Brandnew Inc")
        db.add(job)
        await db.flush()

        application = await promote_discovered_job(db, user_id, job.id)

        from sqlalchemy import select
        from app.models.company.company import Company as CompanyModel
        stmt = (
            select(CompanyModel)
            .where(CompanyModel.user_id == user_id, CompanyModel.name == "Brandnew Inc")
        )
        result = await db.execute(stmt)
        company = result.scalar_one_or_none()
        assert company is not None
        assert application.company_id == company.id

    @pytest.mark.asyncio
    async def test_reuses_existing_company(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """promote_discovered_job reuses an existing same-name Company."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        existing_company = Company(user_id=user_id, name="Shared Corp")
        db.add(existing_company)
        await db.flush()

        job = _make_discovered_job(user_id, company_name="Shared Corp")
        db.add(job)
        await db.flush()

        application = await promote_discovered_job(db, user_id, job.id)

        assert application.company_id == existing_company.id


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

class TestPromoteIdempotency:
    @pytest.mark.asyncio
    async def test_second_promote_returns_existing_application(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """A second call for the same job returns the existing Application."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        job = _make_discovered_job(user_id)
        db.add(job)
        await db.flush()

        first = await promote_discovered_job(db, user_id, job.id)
        second = await promote_discovered_job(db, user_id, job.id)

        assert first.id == second.id

        # No duplicate events — only one ApplicationEvent row.
        from sqlalchemy import select
        from app.models.application.application_event import ApplicationEvent
        stmt = select(ApplicationEvent).where(
            ApplicationEvent.application_id == first.id,
        )
        result = await db.execute(stmt)
        events = result.scalars().all()
        assert len(events) == 1


# ---------------------------------------------------------------------------
# Source mapping
# ---------------------------------------------------------------------------

class TestSourceMapping:
    @pytest.mark.asyncio
    async def test_each_known_publisher_maps_correctly(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """Every key in PUBLISHER_TO_SOURCE produces the correct application.source."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        for publisher_lower, expected_source in PUBLISHER_TO_SOURCE.items():
            job = _make_discovered_job(
                user_id,
                source_external_id=str(uuid.uuid4()),
                # Unique title per publisher avoids the uq_application_user_role
                # unique constraint (user_id, company_id, lower(role_title), url).
                title=f"Engineer via {publisher_lower.capitalize()}",
                source_publisher=publisher_lower.capitalize(),
            )
            db.add(job)
            await db.flush()

            application = await promote_discovered_job(db, user_id, job.id)
            assert application.source == expected_source, (
                f"publisher={publisher_lower!r} expected source={expected_source!r}, "
                f"got {application.source!r}"
            )

    @pytest.mark.asyncio
    async def test_unknown_publisher_falls_back_to_direct(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """A publisher not in the map produces source='direct'."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])

        job = _make_discovered_job(user_id, source_publisher="UnknownBoard")
        db.add(job)
        await db.flush()

        application = await promote_discovered_job(db, user_id, job.id)
        assert application.source == "direct"


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------

class TestPromoteTenantIsolation:
    @pytest.mark.asyncio
    async def test_cross_tenant_raises_promote_error(
        self, user_factory, db: AsyncSession,
    ) -> None:
        """Attempting to promote another user's job raises DiscoveryPromoteError."""
        owner = await user_factory()
        attacker = await user_factory()
        owner_id = uuid.UUID(owner["id"])
        attacker_id = uuid.UUID(attacker["id"])

        job = _make_discovered_job(owner_id)
        db.add(job)
        await db.flush()

        with pytest.raises(DiscoveryPromoteError):
            await promote_discovered_job(db, attacker_id, job.id)

    @pytest.mark.asyncio
    async def test_nonexistent_job_raises_promote_error(
        self, db: AsyncSession,
    ) -> None:
        with pytest.raises(DiscoveryPromoteError):
            await promote_discovered_job(db, uuid.uuid4(), uuid.uuid4())
