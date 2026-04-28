"""Repository tests for ``reference_repo`` (applicant_references).

Covers:
- create / list_for_applicant / mark_contacted
- Tenant isolation through Applicant join
- PII round-trip on reference_name / reference_contact via EncryptedString
- CheckConstraint: invalid relationship rejected
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.reference import Reference
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import reference_repo


def _make_applicant(
    *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        organization_id=organization_id, user_id=user_id,
        stage="lead",
    )


class TestReferenceRepoCreate:
    @pytest.mark.asyncio
    async def test_create_persists_with_pii_round_trip(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        ref = await reference_repo.create(
            db,
            applicant_id=a.id,
            relationship="landlord",
            reference_name="John Q Landlord",
            reference_contact="john@example.com",
            notes="prev tenant for 2 years",
        )
        await db.commit()
        await db.refresh(ref)

        # PII round-trip via EncryptedString.
        assert ref.reference_name == "John Q Landlord"
        assert ref.reference_contact == "john@example.com"
        assert ref.notes == "prev tenant for 2 years"
        assert ref.key_version == 1


class TestReferenceRepoList:
    @pytest.mark.asyncio
    async def test_list_returns_references_for_owned_applicant(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await reference_repo.create(
            db, applicant_id=a.id, relationship="landlord",
            reference_name="A", reference_contact="a@example.com",
        )
        await reference_repo.create(
            db, applicant_id=a.id, relationship="employer",
            reference_name="B", reference_contact="b@example.com",
        )
        await db.commit()

        results = await reference_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert len(results) == 2
        assert {r.relationship for r in results} == {"landlord", "employer"}

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await reference_repo.create(
            db, applicant_id=a.id, relationship="landlord",
            reference_name="A", reference_contact="a@example.com",
        )
        await db.commit()

        results = await reference_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert results == []


class TestReferenceRepoMarkContacted:
    @pytest.mark.asyncio
    async def test_mark_contacted_sets_timestamp(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        ref = await reference_repo.create(
            db, applicant_id=a.id, relationship="landlord",
            reference_name="A", reference_contact="a@example.com",
        )
        await db.commit()

        when = _dt.datetime.now(_dt.timezone.utc)
        updated = await reference_repo.mark_contacted(
            db, reference_id=ref.id,
            organization_id=test_org.id, user_id=test_user.id,
            contacted_at=when, notes="left voicemail",
        )
        await db.commit()
        assert updated is not None
        assert updated.contacted_at is not None
        assert updated.contacted_at.replace(tzinfo=None) == when.replace(tzinfo=None)
        assert updated.notes == "left voicemail"

    @pytest.mark.asyncio
    async def test_mark_contacted_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        ref = await reference_repo.create(
            db, applicant_id=a.id, relationship="landlord",
            reference_name="A", reference_contact="a@example.com",
        )
        await db.commit()

        result = await reference_repo.mark_contacted(
            db, reference_id=ref.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert result is None


class TestReferenceConstraints:
    @pytest.mark.asyncio
    async def test_invalid_relationship_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = Reference(
            applicant_id=a.id,
            relationship="ufologist",
            reference_name="X",
            reference_contact="x@example.com",
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()


class TestReferenceCascade:
    def test_fk_declares_cascade(self) -> None:
        fk = next(iter(Reference.__table__.c.applicant_id.foreign_keys))
        assert fk.ondelete == "CASCADE"
