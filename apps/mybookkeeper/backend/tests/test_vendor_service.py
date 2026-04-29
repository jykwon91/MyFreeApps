"""Service-layer tests for vendor_service (read-only, PR 4.1a).

Exercises the orchestration path: service must call the right repo methods
and shape the response into the right Pydantic schema. SQLite in-memory test
DB via the shared ``db`` fixture; the service's ``AsyncSessionLocal`` is
monkey-patched to reuse the test session.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.vendors import vendor_repo
from app.services.vendors import vendor_service


def _patch_session(
    monkeypatch: pytest.MonkeyPatch, db: AsyncSession,
) -> None:
    @asynccontextmanager
    async def _fake_session():
        yield db

    monkeypatch.setattr(
        "app.services.vendors.vendor_service.AsyncSessionLocal",
        _fake_session,
    )


class TestListVendors:
    @pytest.mark.asyncio
    async def test_returns_summaries_and_total(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        v1 = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Plumber A",
            category="plumber",
        )
        v2 = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Electrician B",
            category="electrician",
            preferred=True,
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        envelope = await vendor_service.list_vendors(
            test_org.id, test_user.id,
        )
        assert envelope.total == 2
        assert envelope.has_more is False
        assert {item.id for item in envelope.items} == {v1.id, v2.id}

    @pytest.mark.asyncio
    async def test_category_filter_narrows(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Plumber",
            category="plumber",
        )
        target = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="HVAC Pro",
            category="hvac",
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        envelope = await vendor_service.list_vendors(
            test_org.id, test_user.id, category="hvac",
        )
        assert envelope.total == 1
        assert envelope.items[0].id == target.id

    @pytest.mark.asyncio
    async def test_preferred_filter_narrows(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Regular",
            category="plumber",
            preferred=False,
        )
        target = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Top Pick",
            category="plumber",
            preferred=True,
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        envelope = await vendor_service.list_vendors(
            test_org.id, test_user.id, preferred=True,
        )
        assert envelope.total == 1
        assert envelope.items[0].id == target.id

    @pytest.mark.asyncio
    async def test_pagination_sets_has_more(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        for i in range(3):
            await vendor_repo.create(
                db,
                organization_id=test_org.id,
                user_id=test_user.id,
                name=f"V{i}",
                category="handyman",
            )
        await db.commit()
        _patch_session(monkeypatch, db)

        envelope = await vendor_service.list_vendors(
            test_org.id, test_user.id, limit=2, offset=0,
        )
        assert envelope.total == 3
        assert len(envelope.items) == 2
        assert envelope.has_more is True

        envelope2 = await vendor_service.list_vendors(
            test_org.id, test_user.id, limit=2, offset=2,
        )
        assert envelope2.total == 3
        assert len(envelope2.items) == 1
        assert envelope2.has_more is False


class TestGetVendor:
    @pytest.mark.asyncio
    async def test_returns_full_response(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Acme",
            category="general_contractor",
            phone="555-0123",
            email="acme@example.com",
            address="1 Acme Way",
            hourly_rate=Decimal("99.99"),
            flat_rate_notes="Flat $500 per kitchen",
            preferred=True,
            notes="Highly recommended",
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        response = await vendor_service.get_vendor(
            test_org.id, test_user.id, vendor.id,
        )
        assert response.id == vendor.id
        assert response.name == "Acme"
        assert response.category == "general_contractor"
        assert response.phone == "555-0123"
        assert response.email == "acme@example.com"
        assert response.address == "1 Acme Way"
        assert response.hourly_rate == Decimal("99.99")
        assert response.flat_rate_notes == "Flat $500 per kitchen"
        assert response.preferred is True
        assert response.notes == "Highly recommended"

    @pytest.mark.asyncio
    async def test_raises_lookup_error_for_other_tenant(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Hidden",
            category="plumber",
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        other_org = uuid.uuid4()
        with pytest.raises(LookupError):
            await vendor_service.get_vendor(
                other_org, test_user.id, vendor.id,
            )

    @pytest.mark.asyncio
    async def test_raises_lookup_error_for_soft_deleted(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Gone",
            category="plumber",
        )
        await db.commit()
        ok = await vendor_repo.soft_delete(
            db,
            vendor_id=vendor.id,
            organization_id=test_org.id,
            user_id=test_user.id,
        )
        assert ok is True
        await db.commit()
        _patch_session(monkeypatch, db)

        with pytest.raises(LookupError):
            await vendor_service.get_vendor(
                test_org.id, test_user.id, vendor.id,
            )
