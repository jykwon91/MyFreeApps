"""Service-layer tests for applicant_service (read-only, PR 3.1b).

Exercises the orchestration path: the service must call the right repos and
shape the response into the right Pydantic schema. SQLite in-memory test DB
via the shared ``db`` fixture.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    reference_repo,
    screening_result_repo,
    video_call_note_repo,
)
from app.services.applicants import applicant_service


class TestListApplicants:
    @pytest.mark.asyncio
    async def test_lists_returns_summaries_and_total(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Seed two applicants for the tenant.
        a1 = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            legal_name="Jane Doe",
            employer_or_hospital="Memorial Hermann",
            stage="lead",
        )
        a2 = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            legal_name="John Roe",
            employer_or_hospital="Texas Children's",
            stage="screening_pending",
        )
        await db.commit()

        # Wire the service to use the existing test DB session instead of
        # creating its own AsyncSessionLocal (which points at production).
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_session():
            yield db

        monkeypatch.setattr(
            "app.services.applicants.applicant_service.AsyncSessionLocal",
            _fake_session,
        )

        envelope = await applicant_service.list_applicants(
            test_org.id, test_user.id,
        )
        assert envelope.total == 2
        assert envelope.has_more is False
        ids = {item.id for item in envelope.items}
        assert {a1.id, a2.id} == ids

    @pytest.mark.asyncio
    async def test_stage_filter_narrows(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="lead",
        )
        target = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="screening_pending",
        )
        await db.commit()

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_session():
            yield db

        monkeypatch.setattr(
            "app.services.applicants.applicant_service.AsyncSessionLocal",
            _fake_session,
        )

        envelope = await applicant_service.list_applicants(
            test_org.id, test_user.id, stage="screening_pending",
        )
        assert envelope.total == 1
        assert envelope.items[0].id == target.id


class TestGetApplicant:
    @pytest.mark.asyncio
    async def test_returns_detail_with_children(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        applicant = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            legal_name="Jane Doe",
            stage="lead",
        )
        now = _dt.datetime.now(_dt.timezone.utc)
        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="lead",
            actor="host",
            occurred_at=now,
        )
        await screening_result_repo.create(
            db,
            applicant_id=applicant.id,
            provider="keycheck",
            requested_at=now,
            status="pending",
        )
        await reference_repo.create(
            db,
            applicant_id=applicant.id,
            relationship="employer",
            reference_name="Ref One",
            reference_contact="ref@example.com",
        )
        await video_call_note_repo.create(
            db,
            applicant_id=applicant.id,
            scheduled_at=now,
            gut_rating=5,
            notes="Solid call",
        )
        await db.commit()

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_session():
            yield db

        monkeypatch.setattr(
            "app.services.applicants.applicant_service.AsyncSessionLocal",
            _fake_session,
        )

        detail = await applicant_service.get_applicant(
            test_org.id, test_user.id, applicant.id,
        )
        assert detail.id == applicant.id
        assert detail.legal_name == "Jane Doe"
        assert len(detail.events) == 1
        assert detail.events[0].event_type == "lead"
        assert len(detail.screening_results) == 1
        assert detail.screening_results[0].provider == "keycheck"
        assert len(detail.references) == 1
        assert detail.references[0].reference_name == "Ref One"
        assert len(detail.video_call_notes) == 1
        assert detail.video_call_notes[0].gut_rating == 5

    @pytest.mark.asyncio
    async def test_raises_lookup_error_for_other_tenant(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        applicant = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="lead",
        )
        await db.commit()

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_session():
            yield db

        monkeypatch.setattr(
            "app.services.applicants.applicant_service.AsyncSessionLocal",
            _fake_session,
        )

        # Different org_id — must raise LookupError.
        other_org_id = uuid.uuid4()
        with pytest.raises(LookupError):
            await applicant_service.get_applicant(
                other_org_id, test_user.id, applicant.id,
            )
