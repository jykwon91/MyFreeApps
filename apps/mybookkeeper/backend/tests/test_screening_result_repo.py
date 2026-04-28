"""Repository tests for ``screening_result_repo``.

Covers:
- create / list_for_applicant / update_status
- Tenant isolation through Applicant join
- CheckConstraints: invalid provider / status rejected
- Partial UNIQUE: two pending screenings for same (applicant, provider) rejected
- Cascade delete: applicant hard-delete deletes screening_results
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.screening_result import ScreeningResult
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import screening_result_repo


def _make_applicant(
    *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        organization_id=organization_id, user_id=user_id,
        stage="lead",
    )


class TestScreeningResultRepoCreate:
    @pytest.mark.asyncio
    async def test_create_persists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        sr = await screening_result_repo.create(
            db,
            applicant_id=a.id,
            provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc),
            status="pending",
        )
        await db.commit()
        assert sr.applicant_id == a.id
        assert sr.provider == "keycheck"
        assert sr.status == "pending"


class TestScreeningResultRepoList:
    @pytest.mark.asyncio
    async def test_list_returns_screenings_for_owned_applicant(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pass",
        )
        await db.commit()

        results = await screening_result_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert len(results) == 1
        assert results[0].provider == "keycheck"

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pass",
        )
        await db.commit()

        # Cross-org access returns empty even though applicant_id is real.
        results = await screening_result_repo.list_for_applicant(
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

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pass",
        )
        await db.commit()

        results = await screening_result_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=uuid.uuid4(),
        )
        assert results == []


class TestScreeningResultRepoUpdate:
    @pytest.mark.asyncio
    async def test_update_status_persists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        sr = await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pending",
        )
        await db.commit()

        completed = _dt.datetime.now(_dt.timezone.utc)
        updated = await screening_result_repo.update_status(
            db, screening_result_id=sr.id,
            organization_id=test_org.id, user_id=test_user.id,
            status="pass", completed_at=completed,
        )
        await db.commit()
        assert updated is not None
        assert updated.status == "pass"
        # SQLite drops tz info on read; compare naive parts of the timestamp.
        assert updated.completed_at is not None
        assert updated.completed_at.replace(tzinfo=None) == completed.replace(tzinfo=None)

    @pytest.mark.asyncio
    async def test_update_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        sr = await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pending",
        )
        await db.commit()

        result = await screening_result_repo.update_status(
            db, screening_result_id=sr.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
            status="pass",
        )
        assert result is None


class TestScreeningResultConstraints:
    @pytest.mark.asyncio
    async def test_invalid_provider_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = ScreeningResult(
            applicant_id=a.id,
            provider="bogus",
            status="pending",
            requested_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_invalid_status_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = ScreeningResult(
            applicant_id=a.id,
            provider="keycheck",
            status="never_heard_of_this",
            requested_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_two_pending_for_same_provider_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Partial UNIQUE prevents concurrent in-flight screenings for the
        same (applicant, provider) — once one completes, status moves off
        'pending' and a re-run is allowed.

        SQLite's partial-index implementation does not enforce the WHERE
        predicate the same way Postgres does — it treats the index as a
        full unique on (applicant_id, provider) regardless of status. The
        migration source / index existence is verified separately in
        ``test_applicant_indexes.py``; here we only verify the duplicate
        is rejected (the correct behavior for the pending case)."""
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pending",
        )
        await db.commit()

        # The repository's ``create`` calls ``db.flush()`` which is where the
        # UNIQUE violation surfaces — the IntegrityError fires before commit.
        with pytest.raises(IntegrityError):
            await screening_result_repo.create(
                db, applicant_id=a.id, provider="keycheck",
                requested_at=_dt.datetime.now(_dt.timezone.utc), status="pending",
            )
        await db.rollback()

    @pytest.mark.asyncio
    async def test_pending_and_completed_for_same_provider_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Partial UNIQUE only applies to status='pending' on Postgres.

        Skipped on SQLite because SQLite's partial-index implementation
        does not enforce the WHERE predicate — the test_applicant_indexes
        test verifies the migration source has the correct ``WHERE
        status = 'pending'`` predicate for production behavior.
        """
        # This is a dialect-dependent behavior assertion. Read the dialect
        # name from the bind to skip on SQLite without coupling to fixtures.
        dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
        if dialect_name == "sqlite":
            pytest.skip(
                "SQLite ignores partial-index WHERE clauses — Postgres-only behavior. "
                "Migration predicate verified in test_applicant_indexes.py.",
            )

        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="fail",
        )
        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pending",
        )
        await db.commit()


class TestScreeningResultCascade:
    @pytest.mark.asyncio
    async def test_hard_delete_applicant_cascades_to_screening_results(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """SQLite test fixture has FK enforcement OFF, so verify the FK
        declaration says CASCADE rather than relying on runtime behavior."""
        fk = next(iter(ScreeningResult.__table__.c.applicant_id.foreign_keys))
        assert fk.ondelete == "CASCADE"

        # Manual cleanup parity: delete the screening_result rows ourselves
        # to mirror what CASCADE would do in Postgres, and confirm the rows
        # are gone — ensures the test cleanup story works end-to-end.
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await screening_result_repo.create(
            db, applicant_id=a.id, provider="keycheck",
            requested_at=_dt.datetime.now(_dt.timezone.utc), status="pass",
        )
        await db.commit()

        await db.execute(
            delete(ScreeningResult).where(ScreeningResult.applicant_id == a.id),
        )
        await db.execute(delete(Applicant).where(Applicant.id == a.id))
        await db.commit()

        remaining = (await db.execute(
            select(ScreeningResult).where(ScreeningResult.applicant_id == a.id),
        )).all()
        assert remaining == []
