"""Repository tests for ``applicant_event_repo``.

Covers:
- append / list_for_applicant
- Tenant isolation through Applicant join
- Chronological ordering
- CheckConstraints: invalid event_type / actor rejected
- Append-only: no update/delete methods exist
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import applicant_event_repo


def _make_applicant(
    *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        organization_id=organization_id, user_id=user_id,
        stage="lead",
    )


class TestApplicantEventRepoAppend:
    @pytest.mark.asyncio
    async def test_append_persists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        when = _dt.datetime.now(_dt.timezone.utc)
        ev = await applicant_event_repo.append(
            db, applicant_id=a.id,
            event_type="lead", actor="system",
            occurred_at=when, notes="auto-promoted from inquiry",
        )
        await db.commit()
        assert ev.applicant_id == a.id
        assert ev.event_type == "lead"
        assert ev.actor == "system"
        # SQLite drops tz info on read; compare naive parts.
        assert ev.occurred_at.replace(tzinfo=None) == when.replace(tzinfo=None)


class TestApplicantEventRepoList:
    @pytest.mark.asyncio
    async def test_list_returns_chronological(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        now = _dt.datetime.now(_dt.timezone.utc)
        for i, etype in enumerate(("lead", "screening_pending", "screening_passed")):
            await applicant_event_repo.append(
                db, applicant_id=a.id,
                event_type=etype, actor="system",
                occurred_at=now + _dt.timedelta(seconds=i),
            )
        await db.commit()

        results = await applicant_event_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert [e.event_type for e in results] == [
            "lead", "screening_pending", "screening_passed",
        ]

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await applicant_event_repo.append(
            db, applicant_id=a.id,
            event_type="lead", actor="system",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.commit()

        results = await applicant_event_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert results == []

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await applicant_event_repo.append(
            db, applicant_id=a.id,
            event_type="lead", actor="system",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.commit()

        results = await applicant_event_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=uuid.uuid4(),
        )
        assert results == []


class TestApplicantEventConstraints:
    @pytest.mark.asyncio
    async def test_invalid_event_type_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = ApplicantEvent(
            applicant_id=a.id,
            event_type="banana_split",
            actor="host",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_invalid_actor_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = ApplicantEvent(
            applicant_id=a.id,
            event_type="lead",
            actor="alien",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_supplementary_event_types_accepted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The applicant_events check constraint includes non-stage event
        types: note_added, screening_initiated, screening_completed,
        reference_contacted. Each must be insertable."""
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        for etype in (
            "note_added", "screening_initiated",
            "screening_completed", "reference_contacted",
        ):
            await applicant_event_repo.append(
                db, applicant_id=a.id,
                event_type=etype, actor="host",
                occurred_at=_dt.datetime.now(_dt.timezone.utc),
            )
        await db.commit()

    def test_repo_does_not_expose_update_or_delete(self) -> None:
        """Append-only contract: this repo intentionally has no update/delete
        helpers. Locking it in here so a future PR doesn't sneak one in."""
        for forbidden in ("update", "delete", "remove", "modify", "edit"):
            assert not hasattr(applicant_event_repo, forbidden), (
                f"applicant_event_repo must not expose {forbidden!r} — events are immutable"
            )
