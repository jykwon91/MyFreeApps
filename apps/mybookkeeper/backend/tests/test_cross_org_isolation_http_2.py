"""HTTP-level cross-org isolation for rent reminders, the health-dashboard
resolve action and channel listings.

Two orgs, two users. Org A owns a reminder plan, a health event and a channel
listing; every request is then made as Org B (an owner of its own org) and must
neither see nor change Org A's rows. The app's convention for a foreign id is
404, never 403, so a caller cannot tell a row in another org from one that does
not exist.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import AsyncIterator, NamedTuple
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.listings.channel import Channel
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.system.system_event import SystemEvent
from app.models.user.user import User
from app.repositories import organization_repo

_SESSION_PATCH_TARGETS = (
    "app.core.permissions.AsyncSessionLocal",
    "app.services.rent.rent_reminder_service.unit_of_work",
    "app.services.rent.rent_reminder_dispatch_service.unit_of_work",
    "app.services.system.health_service.AsyncSessionLocal",
    "app.services.system.health_service.unit_of_work",
    "app.services.listings.channel_listing_service.unit_of_work",
)
_CHANNEL_ID = "airbnb"
_EXTERNAL_URL = "https://airbnb.example.com/rooms/1"
_PLAN_BODY = {
    "frequency": "monthly",
    "send_days_before": 3,
    "send_time": "10:00:00",
    "email_enabled": True,
    "sms_enabled": False,
}


class OrgSide(NamedTuple):
    user: User
    org: Organization


class OrgAData(NamedTuple):
    applicant_id: uuid.UUID
    plan_id: uuid.UUID
    event_id: uuid.UUID
    listing_id: uuid.UUID
    channel_listing_id: uuid.UUID


async def _make_side(db: AsyncSession, label: str) -> OrgSide:
    user = User(
        id=uuid.uuid4(),
        email=f"{label}-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    org = await organization_repo.create(db, f"Org {label}", user.id)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return OrgSide(user, org)


@pytest_asyncio.fixture()
async def side_a(db: AsyncSession) -> OrgSide:
    return await _make_side(db, "a")


@pytest_asyncio.fixture()
async def side_b(db: AsyncSession) -> OrgSide:
    return await _make_side(db, "b")


@pytest.fixture(autouse=True)
def _share_test_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    patches = [patch(target, _fake_session) for target in _SESSION_PATCH_TARGETS]
    for p in patches:
        p.start()
    yield
    for p in patches:
        p.stop()


@pytest_asyncio.fixture()
async def org_a_data(db: AsyncSession, side_a: OrgSide) -> OrgAData:
    org_id, user_id = side_a.org.id, side_a.user.id

    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        name="A House", type=PropertyType.SHORT_TERM,
    )
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, stage="lease_signed",
        contact_email="tenant-a@example.com",
    )
    channel = Channel(id=_CHANNEL_ID, name="Airbnb", supports_ical_import=True)
    db.add_all([prop, applicant, channel])
    await db.flush()

    plan = RentReminderPlan(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        applicant_id=applicant.id, frequency="monthly", send_days_before=3,
    )
    event = SystemEvent(
        id=uuid.uuid4(), organization_id=org_id, event_type="worker_error",
        severity="error", message="A's worker failed",
    )
    listing = Listing(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, property_id=prop.id,
        title="A Room", monthly_rate=Decimal("900.00"), room_type="private_room",
    )
    db.add_all([plan, event, listing])
    await db.flush()

    channel_listing = ChannelListing(
        id=uuid.uuid4(), listing_id=listing.id, channel_id=_CHANNEL_ID,
        external_url=_EXTERNAL_URL,
    )
    db.add(channel_listing)
    await db.commit()

    return OrgAData(
        applicant_id=applicant.id, plan_id=plan.id, event_id=event.id,
        listing_id=listing.id, channel_listing_id=channel_listing.id,
    )


async def _client_for(side: OrgSide) -> AsyncIterator[AsyncClient]:
    async def _ctx() -> RequestContext:
        return RequestContext(
            organization_id=side.org.id, user_id=side.user.id, org_role="owner",
        )

    app.dependency_overrides[current_active_user] = lambda: None
    app.dependency_overrides[current_org_member] = _ctx
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def client_a(side_a: OrgSide) -> AsyncIterator[AsyncClient]:
    async for c in _client_for(side_a):
        yield c


@pytest_asyncio.fixture()
async def client_b(side_b: OrgSide) -> AsyncIterator[AsyncClient]:
    async for c in _client_for(side_b):
        yield c


class TestRentReminderIsolation:
    @pytest.mark.asyncio
    async def test_cannot_read_other_orgs_overview(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(f"/rent-reminders/tenants/{org_a_data.applicant_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_preview_other_orgs_reminder(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(f"/rent-reminders/tenants/{org_a_data.applicant_id}/preview")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_list_other_orgs_send_history(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(f"/rent-reminders/tenants/{org_a_data.applicant_id}/sends")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_create_plan_for_other_orgs_tenant(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            f"/rent-reminders/tenants/{org_a_data.applicant_id}/plan", json=_PLAN_BODY,
        )
        assert resp.status_code == 404
        plans = (await db.execute(select(RentReminderPlan))).scalars().all()
        assert [p.id for p in plans] == [org_a_data.plan_id]

    @pytest.mark.asyncio
    async def test_cannot_update_other_orgs_plan(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.put(
            f"/rent-reminders/tenants/{org_a_data.applicant_id}/plan",
            json={**_PLAN_BODY, "send_days_before": 7, "payment_instructions": "pay me"},
        )
        assert resp.status_code == 404
        plan = await db.get(RentReminderPlan, org_a_data.plan_id)
        await db.refresh(plan)
        assert plan.send_days_before == 3
        assert plan.payment_instructions is None

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_plan(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/rent-reminders/tenants/{org_a_data.applicant_id}/plan")
        assert resp.status_code == 404
        plan = await db.get(RentReminderPlan, org_a_data.plan_id)
        await db.refresh(plan)
        assert plan.deleted_at is None

    @pytest.mark.asyncio
    async def test_cannot_send_now_to_other_orgs_tenant(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(
            f"/rent-reminders/tenants/{org_a_data.applicant_id}/send-now",
            json={
                "due_date": "2026-02-01", "amount": "900.00",
                "message": "rent due", "channels": ["email"],
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_owner_can_read_own_overview(
        self, client_a: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_a.get(f"/rent-reminders/tenants/{org_a_data.applicant_id}")
        assert resp.status_code == 200
        assert resp.json()["plan"]["id"] == str(org_a_data.plan_id)


class TestHealthDashboardIsolation:
    @pytest.mark.asyncio
    async def test_cannot_resolve_other_orgs_event(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.post(f"/health/events/{org_a_data.event_id}/resolve")
        assert resp.status_code == 404
        event = await db.get(SystemEvent, org_a_data.event_id)
        await db.refresh(event)
        assert event.resolved is False
        assert event.resolved_at is None

    @pytest.mark.asyncio
    async def test_event_list_excludes_other_orgs_events(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get("/health/events")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_owner_can_resolve_own_event(
        self, client_a: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_a.post(f"/health/events/{org_a_data.event_id}/resolve")
        assert resp.status_code == 200
        event = await db.get(SystemEvent, org_a_data.event_id)
        assert event.resolved is True


class TestChannelListingIsolation:
    @pytest.mark.asyncio
    async def test_cannot_list_other_orgs_listing_channels(
        self, client_b: AsyncClient, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.get(f"/listings/{org_a_data.listing_id}/channels")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_link_channel_to_other_orgs_listing(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        db.add(Channel(id="vrbo", name="VRBO"))
        await db.commit()
        resp = await client_b.post(
            f"/listings/{org_a_data.listing_id}/channels",
            json={"channel_id": "vrbo", "external_url": "https://vrbo.example.com/1"},
        )
        assert resp.status_code == 404
        rows = (await db.execute(select(ChannelListing))).scalars().all()
        assert [r.id for r in rows] == [org_a_data.channel_listing_id]

    @pytest.mark.asyncio
    async def test_cannot_update_other_orgs_channel_listing(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.patch(
            f"/channel-listings/{org_a_data.channel_listing_id}",
            json={"external_url": "https://evil.example.com/hijack"},
        )
        assert resp.status_code == 404
        row = await db.get(ChannelListing, org_a_data.channel_listing_id)
        await db.refresh(row)
        assert row.external_url == _EXTERNAL_URL

    @pytest.mark.asyncio
    async def test_cannot_delete_other_orgs_channel_listing(
        self, client_b: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_b.delete(f"/channel-listings/{org_a_data.channel_listing_id}")
        assert resp.status_code == 404
        assert await db.get(ChannelListing, org_a_data.channel_listing_id) is not None

    @pytest.mark.asyncio
    async def test_owner_can_update_own_channel_listing(
        self, client_a: AsyncClient, db: AsyncSession, org_a_data: OrgAData,
    ) -> None:
        resp = await client_a.patch(
            f"/channel-listings/{org_a_data.channel_listing_id}",
            json={"external_url": "https://airbnb.example.com/rooms/2"},
        )
        assert resp.status_code == 200
        row = await db.get(ChannelListing, org_a_data.channel_listing_id)
        await db.refresh(row)
        assert row.external_url == "https://airbnb.example.com/rooms/2"
