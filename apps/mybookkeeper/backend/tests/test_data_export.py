"""Tests for GET /users/me/export (data export endpoint).

Tests cover:
- Export returns the expected top-level keys and user data
- Export excludes sensitive fields (hashed_password, TOTP secret, OAuth tokens)
- Export only returns the authenticated user's data (not another user's)
- Unauthenticated request → 401
"""
import uuid
from datetime import date
from unittest.mock import patch, AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import get_db
from app.main import app
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(email: str = "export-user@example.com") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
    )


def _make_org(user_id: uuid.UUID) -> Organization:
    return Organization(id=uuid.uuid4(), name="Test Workspace", created_by=user_id)


def _make_context(user: User, org: Organization) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role=OrgRole.OWNER,
    )


# ---------------------------------------------------------------------------
# GET /users/me/export — returns expected structure
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_export_returns_user_data(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    org = _make_org(user.id)
    db.add(org)
    await db.flush()

    member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner")
    db.add(member)

    prop = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Rental A",
        address="123 Main St",
    )
    db.add(prop)

    doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        file_name="invoice.pdf",
        file_type="pdf",
        status="processed",
    )
    db.add(doc)

    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        transaction_date=date(2024, 6, 15),
        tax_year=2024,
        amount="500.00",
        transaction_type="expense",
        category="maintenance",
        status="approved",
    )
    db.add(txn)
    await db.commit()

    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[current_org_member] = lambda: _make_context(user, org)
    app.dependency_overrides[get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/users/me/export")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()

    assert "exported_at" in data
    assert data["user"]["email"] == user.email
    assert data["user"]["id"] == str(user.id)
    assert len(data["properties"]) == 1
    assert data["properties"][0]["name"] == "Rental A"
    assert len(data["documents"]) == 1
    assert data["documents"][0]["file_name"] == "invoice.pdf"
    assert len(data["transactions"]) == 1
    assert data["transactions"][0]["category"] == "maintenance"


# ---------------------------------------------------------------------------
# GET /users/me/export — excludes sensitive fields
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_export_excludes_sensitive_fields(db: AsyncSession) -> None:
    user = _make_user()
    user.totp_secret = "FAKESECRET"
    user.totp_recovery_codes = "CODE1,CODE2"
    db.add(user)
    org = _make_org(user.id)
    db.add(org)
    await db.flush()
    member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner")
    db.add(member)
    await db.commit()

    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[current_org_member] = lambda: _make_context(user, org)
    app.dependency_overrides[get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/users/me/export")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.text

    # Must not appear anywhere in the JSON payload
    assert "hashed_password" not in body
    assert "totp_secret" not in body
    assert "totp_recovery_codes" not in body
    assert "access_token" not in body
    assert "refresh_token" not in body
    assert "FAKESECRET" not in body
    assert "CODE1" not in body


# ---------------------------------------------------------------------------
# GET /users/me/export — data isolation (no cross-user leakage)
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_export_only_returns_own_data(db: AsyncSession) -> None:
    user_a = _make_user(email="user-a@example.com")
    user_b = _make_user(email="user-b@example.com")
    db.add(user_a)
    db.add(user_b)

    org_a = _make_org(user_a.id)
    org_b = _make_org(user_b.id)
    db.add(org_a)
    db.add(org_b)
    await db.flush()

    member_a = OrganizationMember(organization_id=org_a.id, user_id=user_a.id, org_role="owner")
    member_b = OrganizationMember(organization_id=org_b.id, user_id=user_b.id, org_role="owner")
    db.add(member_a)
    db.add(member_b)

    doc_b = Document(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        user_id=user_b.id,
        file_name="user_b_secret.pdf",
        file_type="pdf",
        status="processed",
    )
    db.add(doc_b)
    await db.commit()

    # Export as user_a — should not see user_b's document
    app.dependency_overrides[current_active_user] = lambda: user_a
    app.dependency_overrides[current_org_member] = lambda: _make_context(user_a, org_a)
    app.dependency_overrides[get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/users/me/export")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    file_names = [d["file_name"] for d in data["documents"]]
    assert "user_b_secret.pdf" not in file_names


# ---------------------------------------------------------------------------
# GET /users/me/export — unauthenticated
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_unauthenticated_export_blocked() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/users/me/export")
    assert response.status_code == 401
