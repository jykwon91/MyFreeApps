"""Vendors write-path tests (PR 4.2): POST / PATCH / DELETE.

Covers the full layer cake:
- Route layer (HTTP-level): status codes, body shape, auth gating.
- Service layer: tenant isolation, 404 paths, vendor-link clearing on delete.
- Repository layer: allowlist enforcement, soft-delete semantics, partial
  update behaviour.

Mirrors the structure of ``test_listing_routes.py`` / ``test_listing_service.py``
so the patterns stay symmetric between PRs 1.1c (listings) and 4.2 (vendors).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.vendors import vendor_repo
from app.schemas.vendors.vendor_response import VendorResponse
from app.services.vendors import vendor_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _viewer_ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.VIEWER,
    )


def _build_response(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
    name: str = "Acme Plumbing",
    category: str = "plumber",
    preferred: bool = False,
) -> VendorResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return VendorResponse(
        id=vendor_id,
        organization_id=org_id,
        user_id=user_id,
        name=name,
        category=category,
        phone=None,
        email=None,
        address=None,
        hourly_rate=Decimal("100.00"),
        flat_rate_notes=None,
        preferred=preferred,
        notes=None,
        last_used_at=None,
        created_at=now,
        updated_at=now,
    )


def _patch_session(
    monkeypatch: pytest.MonkeyPatch, db: AsyncSession,
) -> None:
    """Force the service module to reuse the test ``db`` session.

    Both ``AsyncSessionLocal`` (read paths) and ``unit_of_work`` (write
    paths) need to be patched because the service imports both.
    """

    @asynccontextmanager
    async def _fake_session():
        yield db

    monkeypatch.setattr(
        "app.services.vendors.vendor_service.AsyncSessionLocal",
        _fake_session,
    )
    monkeypatch.setattr(
        "app.services.vendors.vendor_service.unit_of_work",
        _fake_session,
    )


# ---------------------------------------------------------------------------
# Route-layer tests — auth, status codes, payload shape
# ---------------------------------------------------------------------------


class TestVendorCreateEndpoint:
    @pytest.mark.asyncio
    async def test_creates_with_minimal_payload(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        response_model = _build_response(
            org_id=org_id, user_id=user_id, vendor_id=vendor_id,
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.create_vendor",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.post(
                    "/vendors",
                    json={"name": "Acme Plumbing", "category": "plumber"},
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 201
        assert response.json()["id"] == str(vendor_id)
        assert response.json()["name"] == "Acme Plumbing"

    def test_rejects_invalid_category(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/vendors",
                json={"name": "Bad", "category": "not_a_category"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_rejects_negative_hourly_rate(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/vendors",
                json={"name": "X", "category": "plumber", "hourly_rate": "-1.00"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_rejects_extra_fields(self) -> None:
        """``extra='forbid'`` defends against a malicious client trying to
        inject ``organization_id`` or ``user_id`` via the body.
        """
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/vendors",
                json={
                    "name": "X",
                    "category": "plumber",
                    "organization_id": str(uuid.uuid4()),
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_rejects_blank_name(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/vendors",
                json={"name": "", "category": "plumber"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/vendors", json={"name": "X", "category": "plumber"},
        )
        assert response.status_code == 401

    def test_viewer_blocked_with_403(self) -> None:
        """Per ``require_write_access`` — VIEWER role is read-only."""
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _viewer_ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/vendors", json={"name": "X", "category": "plumber"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 403


class TestVendorUpdateEndpoint:
    @pytest.mark.asyncio
    async def test_updates_partial(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        response_model = _build_response(
            org_id=org_id, user_id=user_id, vendor_id=vendor_id, name="Renamed",
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.update_vendor",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/vendors/{vendor_id}", json={"name": "Renamed"},
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"

    def test_returns_404_when_service_raises(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.update_vendor",
                side_effect=LookupError("Vendor not found"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/vendors/{vendor_id}", json={"name": "X"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    def test_rejects_invalid_category_on_update(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/vendors/{vendor_id}", json={"category": "wizard"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_viewer_blocked_with_403(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _viewer_ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/vendors/{uuid.uuid4()}", json={"name": "X"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 403


class TestVendorDeleteEndpoint:
    def test_returns_204_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.delete_vendor",
                return_value=3,
            ):
                client = TestClient(app)
                response = client.delete(f"/vendors/{vendor_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    def test_returns_404_when_service_raises(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.delete_vendor",
                side_effect=LookupError("Vendor not found"),
            ):
                client = TestClient(app)
                response = client.delete(f"/vendors/{vendor_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    def test_viewer_blocked_with_403(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _viewer_ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.delete(f"/vendors/{uuid.uuid4()}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Service-layer tests — DB roundtrip with the in-memory SQLite engine
# ---------------------------------------------------------------------------


class TestCreateVendorService:
    @pytest.mark.asyncio
    async def test_persists_all_fields(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.schemas.vendors.vendor_create_request import VendorCreateRequest

        _patch_session(monkeypatch, db)
        payload = VendorCreateRequest(
            name="Acme HVAC",
            category="hvac",
            phone="555-0001",
            email="acme@example.com",
            address="1 Main St",
            hourly_rate=Decimal("125.00"),
            flat_rate_notes="Flat $200 for tune-up",
            preferred=True,
            notes="Reliable",
        )
        response = await vendor_service.create_vendor(
            test_org.id, test_user.id, payload,
        )
        assert response.name == "Acme HVAC"
        assert response.category == "hvac"
        assert response.phone == "555-0001"
        assert response.hourly_rate == Decimal("125.00")
        assert response.preferred is True


class TestUpdateVendorService:
    @pytest.mark.asyncio
    async def test_partial_update_only_touches_provided_fields(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.schemas.vendors.vendor_update_request import VendorUpdateRequest

        existing = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Original",
            category="plumber",
            phone="555-0001",
            preferred=False,
        )
        await db.commit()
        _patch_session(monkeypatch, db)

        # Only name is in the patch; phone + preferred must persist unchanged.
        payload = VendorUpdateRequest(name="Renamed")
        response = await vendor_service.update_vendor(
            test_org.id, test_user.id, existing.id, payload,
        )
        assert response.name == "Renamed"
        assert response.phone == "555-0001"
        assert response.preferred is False
        assert response.category == "plumber"

    @pytest.mark.asyncio
    async def test_lookup_error_when_other_tenant(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.schemas.vendors.vendor_update_request import VendorUpdateRequest

        existing = await vendor_repo.create(
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
            await vendor_service.update_vendor(
                other_org, test_user.id, existing.id,
                VendorUpdateRequest(name="Stolen"),
            )


class TestDeleteVendorService:
    @pytest.mark.asyncio
    async def test_clears_vendor_id_on_linked_transactions_and_returns_count(
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
            name="Soon Gone",
            category="cleaner",
        )
        # Two linked + one unlinked transaction.
        for i in range(2):
            db.add(Transaction(
                id=uuid.uuid4(),
                organization_id=test_org.id,
                user_id=test_user.id,
                vendor_id=vendor.id,
                transaction_date=_dt.date(2025, 1, 1),
                tax_year=2025,
                amount=Decimal("100.00"),
                transaction_type="expense",
                category="cleaning_expense",
                vendor=f"Linked {i}",
            ))
        unlinked = Transaction(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            vendor_id=None,
            transaction_date=_dt.date(2025, 1, 2),
            tax_year=2025,
            amount=Decimal("50.00"),
            transaction_type="expense",
            category="other_expense",
            vendor="Unlinked",
        )
        db.add(unlinked)
        await db.commit()

        _patch_session(monkeypatch, db)

        nulled = await vendor_service.delete_vendor(
            test_org.id, test_user.id, vendor.id,
        )
        assert nulled == 2

        # Vendor row gone.
        gone = await vendor_repo.get_by_id(
            db,
            vendor_id=vendor.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            include_deleted=True,
        )
        assert gone is None

        # Unlinked transaction's vendor_id stays None.
        from sqlalchemy import select
        rows = await db.execute(select(Transaction))
        for txn in rows.scalars():
            assert txn.vendor_id is None  # all cleared or already null

    @pytest.mark.asyncio
    async def test_lookup_error_when_vendor_missing(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _patch_session(monkeypatch, db)
        with pytest.raises(LookupError):
            await vendor_service.delete_vendor(
                test_org.id, test_user.id, uuid.uuid4(),
            )


# ---------------------------------------------------------------------------
# Repository-layer tests — allowlist, partial update, count helpers
# ---------------------------------------------------------------------------


class TestVendorRepoUpdate:
    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields_only(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Original",
            category="plumber",
        )
        await db.commit()

        # Sneak a non-allowlisted field through — should be silently dropped.
        forbidden_org = uuid.uuid4()
        updated = await vendor_repo.update(
            db,
            vendor_id=vendor.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            fields={
                "name": "Renamed",
                "organization_id": forbidden_org,
                "id": uuid.uuid4(),
                "deleted_at": _dt.datetime.now(_dt.timezone.utc),
            },
        )
        assert updated is not None
        assert updated.name == "Renamed"
        assert updated.organization_id == test_org.id  # untouched
        assert updated.id == vendor.id  # untouched
        assert updated.deleted_at is None  # untouched

    @pytest.mark.asyncio
    async def test_update_returns_none_for_other_tenant(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Mine",
            category="plumber",
        )
        await db.commit()

        other_org = uuid.uuid4()
        result = await vendor_repo.update(
            db,
            vendor_id=vendor.id,
            organization_id=other_org,
            user_id=test_user.id,
            fields={"name": "Hijacked"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_count_linked_transactions(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
    ) -> None:
        vendor = await vendor_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Vendor",
            category="plumber",
        )
        for i in range(3):
            db.add(Transaction(
                id=uuid.uuid4(),
                organization_id=test_org.id,
                user_id=test_user.id,
                vendor_id=vendor.id,
                transaction_date=_dt.date(2025, 1, 1),
                tax_year=2025,
                amount=Decimal("10.00"),
                transaction_type="expense",
                category="maintenance",
                vendor=f"Txn {i}",
            ))
        # One soft-deleted transaction must be excluded.
        db.add(Transaction(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            vendor_id=vendor.id,
            transaction_date=_dt.date(2025, 1, 2),
            tax_year=2025,
            amount=Decimal("10.00"),
            transaction_type="expense",
            category="maintenance",
            vendor="Soft deleted",
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        ))
        await db.commit()

        count = await vendor_repo.count_linked_transactions(
            db, vendor_id=vendor.id, organization_id=test_org.id,
        )
        assert count == 3
