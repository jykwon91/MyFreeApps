"""An inquiry may only point at one of its organization's own listings.

``POST /inquiries`` and ``PATCH /inquiries/{id}`` used to store any
``listing_id``. The inbox then showed the other organization's listing title,
and promoting the inquiry to an applicant and a lease carried that listing
along. These tests drive the real routes and service against the in-memory
database, and check the inbox stays clean even if such a row already exists.
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
from app.models.inquiries.inquiry import Inquiry
from app.models.listings.listing import Listing
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.services.inquiries import inquiry_service

ORG = uuid.uuid4()
USER = uuid.uuid4()
OTHER_ORG = uuid.uuid4()
OTHER_USER = uuid.uuid4()


@pytest.fixture
def client(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    @asynccontextmanager
    async def _session():
        yield db

    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(inquiry_service, "AsyncSessionLocal", _session)
    monkeypatch.setattr(inquiry_service, "unit_of_work", _uow)
    app.dependency_overrides[require_write_access] = lambda: RequestContext(
        organization_id=ORG, user_id=USER, org_role=OrgRole.OWNER,
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


async def _listing(
    db: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID, title: str,
    deleted: bool = False,
) -> Listing:
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name="House")
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        property_id=prop.id, title=title, monthly_rate=Decimal("1000.00"),
        room_type="private_room", status="active", amenities=[],
        deleted_at=_dt.datetime.now(_dt.timezone.utc) if deleted else None,
    )
    db.add(listing)
    await db.commit()
    return listing


async def _inquiry(db: AsyncSession, *, listing_id: uuid.UUID | None) -> Inquiry:
    inquiry = Inquiry(
        id=uuid.uuid4(), organization_id=ORG, user_id=USER, source="direct",
        stage="new", listing_id=listing_id, inquirer_name="Alice",
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )
    db.add(inquiry)
    await db.commit()
    return inquiry


def _create_body(listing_id: uuid.UUID) -> dict[str, str]:
    return {
        "source": "direct",
        "inquirer_name": "Alice",
        "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "listing_id": str(listing_id),
    }


async def _inquiry_count(db: AsyncSession) -> int:
    return len((await db.execute(select(Inquiry.id))).all())


@pytest.mark.asyncio
async def test_create_rejects_a_listing_of_another_organization(
    db: AsyncSession, client: TestClient,
) -> None:
    foreign = await _listing(db, org_id=OTHER_ORG, user_id=OTHER_USER, title="Theirs")

    resp = client.post("/inquiries", json=_create_body(foreign.id))

    assert resp.status_code == 422
    assert resp.json()["detail"] == "listing_id does not name a listing"
    assert await _inquiry_count(db) == 0


@pytest.mark.asyncio
async def test_create_accepts_own_listing(db: AsyncSession, client: TestClient) -> None:
    mine = await _listing(db, org_id=ORG, user_id=USER, title="Mine")

    resp = client.post("/inquiries", json=_create_body(mine.id))

    assert resp.status_code == 201, resp.text
    assert resp.json()["listing_id"] == str(mine.id)


@pytest.mark.asyncio
async def test_patch_rejects_a_listing_of_another_organization(
    db: AsyncSession, client: TestClient,
) -> None:
    inquiry = await _inquiry(db, listing_id=None)
    foreign = await _listing(db, org_id=OTHER_ORG, user_id=OTHER_USER, title="Theirs")

    resp = client.patch(f"/inquiries/{inquiry.id}", json={"listing_id": str(foreign.id)})

    assert resp.status_code == 422
    await db.refresh(inquiry)
    assert inquiry.listing_id is None


@pytest.mark.asyncio
async def test_patch_accepts_own_listing(db: AsyncSession, client: TestClient) -> None:
    inquiry = await _inquiry(db, listing_id=None)
    mine = await _listing(db, org_id=ORG, user_id=USER, title="Mine")

    resp = client.patch(f"/inquiries/{inquiry.id}", json={"listing_id": str(mine.id)})

    assert resp.status_code == 200, resp.text
    assert resp.json()["listing_id"] == str(mine.id)


@pytest.mark.asyncio
async def test_patch_resending_a_since_deleted_listing_still_saves_other_fields(
    db: AsyncSession, client: TestClient,
) -> None:
    gone = await _listing(db, org_id=ORG, user_id=USER, title="Gone", deleted=True)
    inquiry = await _inquiry(db, listing_id=gone.id)

    resp = client.patch(f"/inquiries/{inquiry.id}", json={
        "listing_id": str(gone.id), "notes": "called back",
    })

    assert resp.status_code == 200, resp.text
    assert resp.json()["notes"] == "called back"


@pytest.mark.asyncio
async def test_inbox_never_shows_another_organizations_listing_title(
    db: AsyncSession, client: TestClient,
) -> None:
    # A row written before the check existed.
    foreign = await _listing(db, org_id=OTHER_ORG, user_id=OTHER_USER, title="Their Room")
    await _inquiry(db, listing_id=foreign.id)

    result = await inquiry_service.list_inbox(ORG, USER)

    assert len(result.items) == 1
    assert result.items[0].listing_title is None
