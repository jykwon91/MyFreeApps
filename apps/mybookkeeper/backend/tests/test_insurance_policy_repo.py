"""Repository-level tests for insurance policies.

Uses the in-memory SQLite fixture from conftest.py. Tests model field coverage,
CRUD operations, soft-delete, IDOR-safe attachment delete, and filtering.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from app.models.listings.listing import Listing
from app.repositories.insurance import (
    insurance_policy_attachment_repo,
    insurance_policy_repo,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_listing(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Listing:
    """Create a minimal Listing row in the test database."""
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id or uuid.uuid4(),  # FK not enforced in SQLite test env
        property_id=uuid.uuid4(),  # FK not enforced in SQLite test env
        title="Test Listing",
        slug=f"test-listing-{uuid.uuid4().hex[:6]}",
        status="active",
        room_type="private_room",
        monthly_rate=1500.00,
    )
    db.add(listing)
    await db.flush()
    return listing


# ---------------------------------------------------------------------------
# Tests — InsurancePolicy CRUD
# ---------------------------------------------------------------------------

class TestInsurancePolicyRepo:
    @pytest.mark.asyncio
    async def test_create_and_get(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Landlord Insurance",
            carrier="State Farm",
            policy_number="POL-123456",
            effective_date=_dt.date(2025, 1, 1),
            expiration_date=_dt.date(2026, 1, 1),
            coverage_amount_cents=50000000,
            notes="Annual renewal",
        )
        await db.commit()

        fetched = await insurance_policy_repo.get(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
        )
        assert fetched is not None
        assert fetched.policy_name == "Landlord Insurance"
        assert fetched.carrier == "State Farm"
        assert fetched.coverage_amount_cents == 50000000

    @pytest.mark.asyncio
    async def test_list_for_org(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Policy A",
        )
        await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Policy B",
        )
        await db.commit()

        policies = await insurance_policy_repo.list_for_org(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
        )
        assert len(policies) == 2

    @pytest.mark.asyncio
    async def test_filter_by_listing_id(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing_a = await _make_listing(db, test_org.id, test_user.id)
        listing_b = await _make_listing(db, test_org.id, test_user.id)
        await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing_a.id,
            policy_name="Policy for A",
        )
        await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing_b.id,
            policy_name="Policy for B",
        )
        await db.commit()

        policies = await insurance_policy_repo.list_for_org(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing_a.id,
        )
        assert len(policies) == 1
        assert policies[0].policy_name == "Policy for A"

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Test Policy",
        )
        await db.commit()

        # Try to fetch with wrong org_id — should return None.
        other_org_id = uuid.uuid4()
        fetched = await insurance_policy_repo.get(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=other_org_id,
        )
        assert fetched is None

    @pytest.mark.asyncio
    async def test_update_policy_fields(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Original Name",
        )
        await db.commit()

        updated = await insurance_policy_repo.update_policy(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
            fields={"carrier": "Allstate", "policy_name": "Updated Name"},
        )
        assert updated is not None
        assert updated.carrier == "Allstate"
        assert updated.policy_name == "Updated Name"

    @pytest.mark.asyncio
    async def test_soft_delete(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Policy to Delete",
        )
        await db.commit()

        deleted = await insurance_policy_repo.soft_delete(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
        )
        assert deleted is True

        # Should not be visible after soft delete.
        fetched = await insurance_policy_repo.get(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
        )
        assert fetched is None

        # But visible with include_deleted=True.
        fetched_deleted = await insurance_policy_repo.get(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
            include_deleted=True,
        )
        assert fetched_deleted is not None
        assert fetched_deleted.deleted_at is not None

    @pytest.mark.asyncio
    async def test_soft_delete_cross_tenant_no_effect(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Protected Policy",
        )
        await db.commit()

        # Try to soft-delete with a different org_id — should return False.
        deleted = await insurance_policy_repo.soft_delete(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=uuid.uuid4(),  # wrong org
        )
        assert deleted is False

        # Verify the policy is still there.
        fetched = await insurance_policy_repo.get(
            db,
            policy_id=policy.id,
            user_id=test_user.id,
            organization_id=test_org.id,
        )
        assert fetched is not None


# ---------------------------------------------------------------------------
# Tests — InsurancePolicyAttachment
# ---------------------------------------------------------------------------

class TestInsurancePolicyAttachmentRepo:
    @pytest.mark.asyncio
    async def test_create_and_list(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Test",
        )
        await db.flush()

        att = await insurance_policy_attachment_repo.create(
            db,
            policy_id=policy.id,
            storage_key=f"insurance-policies/{policy.id}/test-att",
            filename="policy.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            kind="policy_document",
            uploaded_by_user_id=test_user.id,
            uploaded_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.commit()

        attachments = await insurance_policy_attachment_repo.list_by_policy(
            db, policy.id,
        )
        assert len(attachments) == 1
        assert attachments[0].id == att.id
        assert attachments[0].kind == "policy_document"

    @pytest.mark.asyncio
    async def test_idor_safe_delete_correct_policy(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Test",
        )
        await db.flush()

        att = await insurance_policy_attachment_repo.create(
            db,
            policy_id=policy.id,
            storage_key=f"insurance-policies/{policy.id}/test-att",
            filename="policy.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            kind="policy_document",
            uploaded_by_user_id=test_user.id,
            uploaded_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.flush()

        deleted = await insurance_policy_attachment_repo.delete_by_id_scoped_to_policy(
            db, att.id, policy.id,
        )
        assert deleted is not None
        assert deleted.id == att.id

        remaining = await insurance_policy_attachment_repo.list_by_policy(db, policy.id)
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_idor_safe_delete_wrong_policy_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        listing = await _make_listing(db, test_org.id, test_user.id)
        policy_a = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Policy A",
        )
        policy_b = await insurance_policy_repo.create(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            listing_id=listing.id,
            policy_name="Policy B",
        )
        await db.flush()

        att = await insurance_policy_attachment_repo.create(
            db,
            policy_id=policy_a.id,
            storage_key=f"insurance-policies/{policy_a.id}/att",
            filename="policy.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            kind="policy_document",
            uploaded_by_user_id=test_user.id,
            uploaded_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.flush()

        # Pair att.id with the WRONG policy_id — should return None (IDOR guard).
        result = await insurance_policy_attachment_repo.delete_by_id_scoped_to_policy(
            db, att.id, policy_b.id,  # wrong policy
        )
        assert result is None

        # Attachment should still exist.
        remaining = await insurance_policy_attachment_repo.list_by_policy(db, policy_a.id)
        assert len(remaining) == 1
