"""Repository tests for ``applicant_repo``.

Covers:
- create / get / list_for_user / get_by_inquiry / soft_delete / list_pending_purge
- Tenant isolation: every function filters by (organization_id, user_id)
- PII round-trip via EncryptedString
- Soft-delete semantics: include_deleted flag, get_by_inquiry skips deleted
- CheckConstraint: invalid stage rejected by DB
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from app.repositories.applicants import applicant_repo


def _make_applicant(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID | None = None,
    legal_name: str | None = None,
    stage: str = "lead",
    deleted_at: _dt.datetime | None = None,
    sensitive_purged_at: _dt.datetime | None = None,
) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        inquiry_id=inquiry_id,
        legal_name=legal_name,
        stage=stage,
        deleted_at=deleted_at,
        sensitive_purged_at=sensitive_purged_at,
    )


async def _make_second_org(db: AsyncSession) -> tuple[User, Organization]:
    user_b = User(
        id=uuid.uuid4(), email="b@example.com", hashed_password="h",
        is_active=True, is_superuser=False, is_verified=True,
    )
    org_b = Organization(id=uuid.uuid4(), name="B", created_by=user_b.id)
    db.add_all([user_b, org_b])
    await db.flush()
    db.add(OrganizationMember(
        organization_id=org_b.id, user_id=user_b.id, org_role="owner",
    ))
    await db.flush()
    return user_b, org_b


class TestApplicantRepoCreate:
    @pytest.mark.asyncio
    async def test_create_persists_with_pii_round_trip(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        created = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            legal_name="Jane Doe",
            dob="1990-01-15",
            employer_or_hospital="St Lukes Hospital",
            vehicle_make_model="Toyota Camry 2020",
            id_document_storage_key="docs/abc123.pdf",
            smoker=False,
            pets="1 small cat",
        )
        await db.commit()

        fetched = await applicant_repo.get(
            db,
            applicant_id=created.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert fetched is not None
        # PII columns round-trip via EncryptedString.
        assert fetched.legal_name == "Jane Doe"
        assert fetched.dob == "1990-01-15"
        assert fetched.employer_or_hospital == "St Lukes Hospital"
        assert fetched.vehicle_make_model == "Toyota Camry 2020"
        # Non-encrypted columns stored as-is.
        assert fetched.id_document_storage_key == "docs/abc123.pdf"
        assert fetched.smoker is False
        assert fetched.pets == "1 small cat"
        assert fetched.stage == "lead"
        assert fetched.key_version == 1


class TestApplicantRepoGet:
    @pytest.mark.asyncio
    async def test_returns_applicant_when_owned(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="Owned",
        )
        db.add(a)
        await db.commit()

        fetched = await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert fetched is not None
        assert fetched.id == a.id

    @pytest.mark.asyncio
    async def test_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=uuid.uuid4(),
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_skips_soft_deleted_by_default(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_include_deleted_returns_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
            include_deleted=True,
        )
        assert result is not None


class TestApplicantRepoList:
    @pytest.mark.asyncio
    async def test_list_isolates_by_org_and_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Owned by test_user / test_org
        db.add(_make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="Mine",
        ))
        # Different org, same user_id (should NOT leak)
        other_org_id = uuid.uuid4()
        db.add(_make_applicant(
            organization_id=other_org_id, user_id=test_user.id,
            legal_name="OtherOrg",
        ))
        # Different user, same org (should NOT leak)
        db.add(_make_applicant(
            organization_id=test_org.id, user_id=uuid.uuid4(),
            legal_name="OtherUser",
        ))
        await db.commit()

        results = await applicant_repo.list_for_user(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert {a.legal_name for a in results} == {"Mine"}

    @pytest.mark.asyncio
    async def test_list_filters_by_stage(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for stage in ("lead", "lead", "approved"):
            db.add(_make_applicant(
                organization_id=test_org.id, user_id=test_user.id, stage=stage,
            ))
        await db.commit()

        leads = await applicant_repo.list_for_user(
            db, organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
        )
        assert len(leads) == 2

    @pytest.mark.asyncio
    async def test_list_excludes_soft_deleted_by_default(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_applicant(
            organization_id=test_org.id, user_id=test_user.id, legal_name="Live",
        ))
        db.add(_make_applicant(
            organization_id=test_org.id, user_id=test_user.id, legal_name="Dead",
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        ))
        await db.commit()

        results = await applicant_repo.list_for_user(
            db, organization_id=test_org.id, user_id=test_user.id,
        )
        assert {a.legal_name for a in results} == {"Live"}


class TestApplicantRepoGetByInquiry:
    @pytest.mark.asyncio
    async def test_returns_applicant_for_inquiry(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = Inquiry(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            source="direct", stage="new",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inq)
        await db.flush()
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            inquiry_id=inq.id,
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get_by_inquiry(
            db, inquiry_id=inq.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert result is not None
        assert result.id == a.id

    @pytest.mark.asyncio
    async def test_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = Inquiry(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            source="direct", stage="new",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inq)
        await db.flush()
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            inquiry_id=inq.id,
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get_by_inquiry(
            db, inquiry_id=inq.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_skips_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = Inquiry(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            source="direct", stage="new",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inq)
        await db.flush()
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            inquiry_id=inq.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(a)
        await db.commit()

        result = await applicant_repo.get_by_inquiry(
            db, inquiry_id=inq.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert result is None


class TestApplicantRepoSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_sets_deleted_at(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(a)
        await db.commit()

        ok = await applicant_repo.soft_delete(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        await db.commit()
        assert ok is True

        # Subsequent get returns None.
        assert await applicant_repo.get(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        ) is None

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(a)
        await db.commit()

        ok = await applicant_repo.soft_delete(
            db, applicant_id=a.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
        )
        assert ok is False

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(a)
        await db.commit()

        ok = await applicant_repo.soft_delete(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=uuid.uuid4(),
        )
        assert ok is False


class TestApplicantRepoListPendingPurge:
    @pytest.mark.asyncio
    async def test_returns_old_soft_deleted_unpurged_rows(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        # Old, soft-deleted, not yet purged → should be returned.
        old = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="OLD",
            deleted_at=now - _dt.timedelta(days=400),
        )
        # Old, soft-deleted, ALREADY purged → should NOT be returned.
        purged = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="PURGED",
            deleted_at=now - _dt.timedelta(days=400),
            sensitive_purged_at=now - _dt.timedelta(days=10),
        )
        # Recently soft-deleted → should NOT be returned (under cutoff).
        recent = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="RECENT",
            deleted_at=now - _dt.timedelta(days=10),
        )
        # Not soft-deleted at all.
        live = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="LIVE",
        )
        db.add_all([old, purged, recent, live])
        await db.commit()

        results = await applicant_repo.list_pending_purge(
            db, user_id=test_user.id, older_than_days=365,
        )
        assert {a.legal_name for a in results} == {"OLD"}

    @pytest.mark.asyncio
    async def test_isolates_by_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        old = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            legal_name="MINE",
            deleted_at=now - _dt.timedelta(days=400),
        )
        db.add(old)
        await db.commit()

        # Different user — should not see it.
        results = await applicant_repo.list_pending_purge(
            db, user_id=uuid.uuid4(), older_than_days=365,
        )
        assert results == []


class TestApplicantStageConstraint:
    @pytest.mark.asyncio
    async def test_invalid_stage_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        bad = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            stage="totally_invalid",
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()


class TestApplicantInquiryFkSetNull:
    @pytest.mark.asyncio
    async def test_hard_delete_inquiry_nulls_applicant_inquiry_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Per RENTALS_PLAN.md §5.3: applicants outlive their inquiries.
        Inquiry hard-delete (e.g. by retention worker) must set
        applicant.inquiry_id to NULL, not cascade-delete the applicant."""
        inq = Inquiry(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            source="direct", stage="new",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inq)
        await db.flush()
        a = _make_applicant(
            organization_id=test_org.id, user_id=test_user.id,
            inquiry_id=inq.id, legal_name="Survives",
        )
        db.add(a)
        await db.commit()

        # SQLite test fixture has FKs OFF so cascade behavior won't fire.
        # Verify the FK declaration via metadata as a structural regression.
        fk_target = next(iter(Applicant.__table__.c.inquiry_id.foreign_keys))
        assert fk_target.ondelete == "SET NULL"
