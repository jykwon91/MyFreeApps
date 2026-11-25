"""A new lease may only name the caller's own applicant and listing.

``POST /signed-leases`` used to check only the templates and the parent lease,
storing ``applicant_id`` and ``listing_id`` as sent. A lease pointing at
another tenant's applicant or listing then showed that tenant's legal name,
listing title and property name on the calendar. These tests drive the real
route and service against the in-memory database.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.leases.signed_lease import SignedLease
from app.models.listings.listing import Listing
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.repositories.leases import lease_template_repo
from app.services.leases import lease_lifecycle_service
from app.services.leases._lease_helpers import (
    ApplicantNotFoundError,
    ListingNotFoundError,
)
from app.services.leases.lease_references import resolve_lease_references

ORG = uuid.uuid4()
USER = uuid.uuid4()
OTHER_ORG = uuid.uuid4()
OTHER_USER = uuid.uuid4()


async def _applicant(
    db: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID,
    inquiry_id: uuid.UUID | None = None,
) -> Applicant:
    applicant = Applicant(
        organization_id=org_id, user_id=user_id, stage="approved",
        legal_name="Tenant", inquiry_id=inquiry_id,
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def _listing(db: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID) -> Listing:
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="House")
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        property_id=prop.id, title="Room", monthly_rate=Decimal("1000.00"),
        room_type="private_room", status="active", amenities=[],
    )
    db.add(listing)
    await db.flush()
    return listing


# ---------------------------------------------------------------------------
# resolve_lease_references
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_keeps_an_explicit_listing_of_the_same_organization(db: AsyncSession) -> None:
    applicant = await _applicant(db, org_id=ORG, user_id=USER)
    listing = await _listing(db, org_id=ORG, user_id=USER)

    resolved = await resolve_lease_references(
        db, applicant_id=applicant.id, listing_id=listing.id, property_id=None,
        organization_id=ORG, user_id=USER,
    )

    assert resolved.listing_id == listing.id
    assert resolved.property_id == listing.property_id


@pytest.mark.asyncio
async def test_rejects_a_listing_of_another_organization(db: AsyncSession) -> None:
    applicant = await _applicant(db, org_id=ORG, user_id=USER)
    foreign = await _listing(db, org_id=OTHER_ORG, user_id=OTHER_USER)

    with pytest.raises(ListingNotFoundError):
        await resolve_lease_references(
            db, applicant_id=applicant.id, listing_id=foreign.id, property_id=None,
            organization_id=ORG, user_id=USER,
        )


@pytest.mark.asyncio
async def test_rejects_an_applicant_of_another_organization(db: AsyncSession) -> None:
    foreign = await _applicant(db, org_id=OTHER_ORG, user_id=OTHER_USER)

    with pytest.raises(ApplicantNotFoundError):
        await resolve_lease_references(
            db, applicant_id=foreign.id, listing_id=None, property_id=None,
            organization_id=ORG, user_id=USER,
        )


@pytest.mark.asyncio
async def test_defaults_to_the_inquiry_listing_when_none_is_sent(db: AsyncSession) -> None:
    listing = await _listing(db, org_id=ORG, user_id=USER)
    inquiry = Inquiry(
        id=uuid.uuid4(), organization_id=ORG, user_id=USER, source="direct",
        stage="new", listing_id=listing.id,
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )
    db.add(inquiry)
    await db.flush()
    applicant = await _applicant(db, org_id=ORG, user_id=USER, inquiry_id=inquiry.id)

    resolved = await resolve_lease_references(
        db, applicant_id=applicant.id, listing_id=None, property_id=None,
        organization_id=ORG, user_id=USER,
    )

    assert resolved.listing_id == listing.id
    assert resolved.property_id == listing.property_id


# ---------------------------------------------------------------------------
# POST /signed-leases, real service
# ---------------------------------------------------------------------------


@pytest.fixture
def client(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    @asynccontextmanager
    async def _uow():
        yield db

    monkeypatch.setattr(lease_lifecycle_service, "unit_of_work", _uow)
    app.dependency_overrides[require_write_access] = lambda: RequestContext(
        organization_id=ORG, user_id=USER, org_role=OrgRole.OWNER,
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


async def _template_id(db: AsyncSession) -> uuid.UUID:
    template = await lease_template_repo.create(
        db, user_id=USER, organization_id=ORG, name="Master",
    )
    return template.id


async def _lease_count(db: AsyncSession) -> int:
    return len((await db.execute(select(SignedLease.id))).all())


@pytest.mark.asyncio
async def test_create_rejects_an_applicant_of_another_organization(
    db: AsyncSession, client: TestClient,
) -> None:
    template_id = await _template_id(db)
    foreign = await _applicant(db, org_id=OTHER_ORG, user_id=OTHER_USER)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)], "applicant_id": str(foreign.id),
    })

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Applicant not found"
    assert await _lease_count(db) == 0


@pytest.mark.asyncio
async def test_create_rejects_a_listing_of_another_organization(
    db: AsyncSession, client: TestClient,
) -> None:
    template_id = await _template_id(db)
    applicant = await _applicant(db, org_id=ORG, user_id=USER)
    foreign = await _listing(db, org_id=OTHER_ORG, user_id=OTHER_USER)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)],
        "applicant_id": str(applicant.id),
        "listing_id": str(foreign.id),
    })

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Listing not found"
    assert await _lease_count(db) == 0


@pytest.mark.asyncio
async def test_create_accepts_own_applicant_and_listing(
    db: AsyncSession, client: TestClient,
) -> None:
    template_id = await _template_id(db)
    applicant = await _applicant(db, org_id=ORG, user_id=USER)
    listing = await _listing(db, org_id=ORG, user_id=USER)

    resp = client.post("/signed-leases", json={
        "template_ids": [str(template_id)],
        "applicant_id": str(applicant.id),
        "listing_id": str(listing.id),
    })

    assert resp.status_code == 201, resp.text
    assert resp.json()["listing_id"] == str(listing.id)
