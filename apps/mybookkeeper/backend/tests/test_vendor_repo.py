"""Repository tests for ``vendor_repo``.

Covers:
- create / get_by_id / list_by_organization / count_by_organization /
  soft_delete / hard_delete_by_id
- Tenant isolation: every function filters by (organization_id, user_id)
- Soft-delete semantics: include_deleted flag
- CheckConstraint: invalid category rejected by DB
- Pagination via limit/offset
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from app.models.vendors.vendor import Vendor
from app.repositories.vendors import vendor_repo


def _make_vendor(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str = "Acme Plumbing",
    category: str = "plumber",
    preferred: bool = False,
    deleted_at: _dt.datetime | None = None,
) -> Vendor:
    return Vendor(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        name=name,
        category=category,
        preferred=preferred,
        deleted_at=deleted_at,
    )


async def _make_second_user_and_org(
    db: AsyncSession,
) -> tuple[User, Organization]:
    user_b = User(
        id=uuid.uuid4(), email="b@example.com", hashed_password="h",
        is_active=True, is_superuser=False, is_verified=True,
    )
    org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
    db.add_all([user_b, org_b])
    await db.flush()
    db.add(OrganizationMember(
        organization_id=org_b.id, user_id=user_b.id, org_role="owner",
    ))
    await db.flush()
    return user_b, org_b


class TestVendorRepoCreate:
    @pytest.mark.asyncio
    async def test_create_persists_all_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        created = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Bob's HVAC",
            category="hvac",
            phone="555-0101",
            email="bob@hvac.example",
            address="123 Main St",
            hourly_rate=Decimal("125.00"),
            flat_rate_notes="Flat $200 for AC tune-up",
            preferred=True,
            notes="Reliable; same-day service.",
        )
        await db.commit()

        fetched = await vendor_repo.get_by_id(
            db,
            vendor_id=created.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert fetched is not None
        assert fetched.name == "Bob's HVAC"
        assert fetched.category == "hvac"
        assert fetched.phone == "555-0101"
        assert fetched.email == "bob@hvac.example"
        assert fetched.address == "123 Main St"
        assert fetched.hourly_rate == Decimal("125.00")
        assert fetched.flat_rate_notes == "Flat $200 for AC tune-up"
        assert fetched.preferred is True
        assert fetched.notes == "Reliable; same-day service."
        assert fetched.deleted_at is None

    @pytest.mark.asyncio
    async def test_create_defaults_preferred_false(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        created = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Default Vendor",
            category="handyman",
        )
        await db.commit()
        assert created.preferred is False


class TestVendorRepoGetById:
    @pytest.mark.asyncio
    async def test_returns_vendor_when_owned(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        fetched = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert fetched is not None
        assert fetched.id == v.id

    @pytest.mark.asyncio
    async def test_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=uuid.uuid4(),
            user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=uuid.uuid4(),
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        result = await vendor_repo.get_by_id(
            db,
            vendor_id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_skips_soft_deleted_by_default(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(
            organization_id=test_org.id,
            user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(v)
        await db.commit()

        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_include_deleted_returns_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(
            organization_id=test_org.id,
            user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(v)
        await db.commit()

        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            include_deleted=True,
        )
        assert result is not None


class TestVendorRepoList:
    @pytest.mark.asyncio
    async def test_list_isolates_by_org_and_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Owned
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=test_user.id, name="Mine",
        ))
        # Different org, same user
        db.add(_make_vendor(
            organization_id=uuid.uuid4(), user_id=test_user.id, name="OtherOrg",
        ))
        # Different user, same org
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=uuid.uuid4(), name="OtherUser",
        ))
        await db.commit()

        results = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert {v.name for v in results} == {"Mine"}

    @pytest.mark.asyncio
    async def test_list_filters_by_category(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for category in ("plumber", "plumber", "electrician"):
            db.add(_make_vendor(
                organization_id=test_org.id, user_id=test_user.id,
                category=category,
            ))
        await db.commit()

        plumbers = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            category="plumber",
        )
        assert len(plumbers) == 2
        assert all(v.category == "plumber" for v in plumbers)

    @pytest.mark.asyncio
    async def test_list_filters_by_preferred(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=test_user.id,
            name="Pref", preferred=True,
        ))
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=test_user.id,
            name="NotPref", preferred=False,
        ))
        await db.commit()

        only_preferred = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            preferred=True,
        )
        assert {v.name for v in only_preferred} == {"Pref"}

        only_not_preferred = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            preferred=False,
        )
        assert {v.name for v in only_not_preferred} == {"NotPref"}

    @pytest.mark.asyncio
    async def test_list_excludes_soft_deleted_by_default(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=test_user.id, name="Live",
        ))
        db.add(_make_vendor(
            organization_id=test_org.id, user_id=test_user.id, name="Dead",
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        ))
        await db.commit()

        results = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert {v.name for v in results} == {"Live"}

    @pytest.mark.asyncio
    async def test_list_paginates(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for i in range(5):
            db.add(_make_vendor(
                organization_id=test_org.id, user_id=test_user.id,
                name=f"Vendor {i}",
            ))
        await db.commit()

        page1 = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            limit=2, offset=0,
        )
        page2 = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            limit=2, offset=2,
        )
        assert len(page1) == 2
        assert len(page2) == 2
        assert {v.id for v in page1}.isdisjoint({v.id for v in page2})

    @pytest.mark.asyncio
    async def test_count_matches_filtered_list(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for category in ("plumber", "plumber", "plumber", "electrician"):
            db.add(_make_vendor(
                organization_id=test_org.id, user_id=test_user.id,
                category=category,
            ))
        await db.commit()

        count = await vendor_repo.count_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            category="plumber",
        )
        assert count == 3


class TestVendorRepoSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_sets_deleted_at(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        ok = await vendor_repo.soft_delete(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        await db.commit()
        assert ok is True

        # Subsequent get returns None.
        assert await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        ) is None

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        ok = await vendor_repo.soft_delete(
            db,
            vendor_id=v.id,
            organization_id=uuid.uuid4(),
            user_id=test_user.id,
        )
        assert ok is False

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        ok = await vendor_repo.soft_delete(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=uuid.uuid4(),
        )
        assert ok is False


class TestVendorRepoHardDelete:
    @pytest.mark.asyncio
    async def test_hard_delete_removes_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        await vendor_repo.hard_delete_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        await db.commit()

        # Even with include_deleted=True, the row should not exist.
        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            include_deleted=True,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_hard_delete_does_not_remove_other_tenant_rows(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        v = _make_vendor(organization_id=test_org.id, user_id=test_user.id)
        db.add(v)
        await db.commit()

        # Cross-tenant attempt — must no-op.
        await vendor_repo.hard_delete_by_id(
            db,
            vendor_id=v.id,
            organization_id=uuid.uuid4(),
            user_id=test_user.id,
        )
        await db.commit()

        result = await vendor_repo.get_by_id(
            db,
            vendor_id=v.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert result is not None


class TestVendorCategoryConstraint:
    @pytest.mark.asyncio
    async def test_invalid_category_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        bad = _make_vendor(
            organization_id=test_org.id,
            user_id=test_user.id,
            category="not_a_category",
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()


class TestVendorTenantIsolation:
    """Two orgs, two users, two vendors — each user must see only their own."""

    @pytest.mark.asyncio
    async def test_each_tenant_sees_only_their_vendor(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        user_b, org_b = await _make_second_user_and_org(db)

        v_a = _make_vendor(
            organization_id=test_org.id, user_id=test_user.id, name="Tenant A Vendor",
        )
        v_b = _make_vendor(
            organization_id=org_b.id, user_id=user_b.id, name="Tenant B Vendor",
        )
        db.add_all([v_a, v_b])
        await db.commit()

        a_view = await vendor_repo.list_by_organization(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        b_view = await vendor_repo.list_by_organization(
            db,
            organization_id=org_b.id,
            user_id=user_b.id,
        )

        assert {v.id for v in a_view} == {v_a.id}
        assert {v.id for v in b_view} == {v_b.id}

        # Cross-checks: A cannot see B's vendor by id and vice versa.
        assert await vendor_repo.get_by_id(
            db,
            vendor_id=v_b.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        ) is None
        assert await vendor_repo.get_by_id(
            db,
            vendor_id=v_a.id,
            organization_id=org_b.id,
            user_id=user_b.id,
        ) is None
