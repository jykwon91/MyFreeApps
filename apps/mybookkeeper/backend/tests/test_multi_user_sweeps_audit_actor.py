"""Sweeps that run across every user audit each user's writes as that user.

The rent-reminder sweep, the lease hand-over and the iCal poll have no request
user, so without ``audit_actor`` their audit rows carry no actor: nobody can
tell whose change it was, and account deletion (which finds a user's audit
history by ``changed_by``) misses them. Each test seeds two owners, so one
actor wrapped around the whole sweep would credit both owners' rows to one.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.audit import current_user_id
from platform_shared.db.models.audit_log import AuditLog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.models.listings.channel import Channel
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.properties.property import Property
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.repositories import channel_listing_repo
from app.services.leases import lease_handover_service
from app.services.listings import channel_sync_service
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.rent import rent_reminder_dispatch_service as dispatch
from app.services.system import email_service

UTC = _dt.UTC
# Saturday Oct 31 2026, 6:30pm Chicago — a weekly Sunday reminder is due.
SATURDAY_EVENING = _dt.datetime(2026, 10, 31, 23, 30, tzinfo=UTC)
# Noon UTC on Nov 2 — Nov 1 has arrived in every host time zone.
AFTER_RENEWAL_START = _dt.datetime(2026, 11, 2, 12, 0, tzinfo=UTC)


def _session_uow(db: AsyncSession):
    @asynccontextmanager
    async def _uow() -> AsyncIterator[AsyncSession]:
        yield db
    return _uow


async def _audit_actors(
    db: AsyncSession, table_name: str, record_id: uuid.UUID, operation: str,
) -> set[str | None]:
    """Who the audit rows of the sweep's ``operation`` on this record name."""
    rows = (await db.execute(
        select(AuditLog.changed_by).where(
            AuditLog.table_name == table_name,
            AuditLog.record_id == str(record_id),
            AuditLog.operation == operation,
        ),
    )).scalars().all()
    assert rows, f"no {operation} audit rows for {table_name} {record_id}"
    return set(rows)


# --------------------------------------------------------------------------
# Rent reminders
# --------------------------------------------------------------------------


@pytest.fixture()
def reminders_wired(db: AsyncSession) -> Iterator[None]:
    fake = _session_uow(db)
    with ExitStack() as stack:
        for target in (
            "app.services.rent.rent_reminder_alert_service.unit_of_work",
            "app.services.rent.rent_reminder_dispatch_service.unit_of_work",
        ):
            stack.enter_context(patch(target, fake))
        stack.enter_context(
            patch.object(alerts, "operator_email", AsyncMock(return_value="host@example.com")),
        )
        stack.enter_context(patch.object(email_service, "send_email_or_raise", AsyncMock()))
        yield


async def _reminder_plan(db: AsyncSession, *, user_id: uuid.UUID) -> RentReminderPlan:
    org_id = uuid.uuid4()
    applicant = Applicant(
        organization_id=org_id, user_id=user_id, stage="lease_signed",
        legal_name="Tenant", contact_email="tenant@example.com",
    )
    db.add(applicant)
    await db.flush()
    db.add(RentSchedule(
        organization_id=org_id, user_id=user_id, applicant_id=applicant.id,
        amount=Decimal("1500.00"), cadence="monthly", start_date=_dt.date(2026, 1, 1),
    ))
    plan = RentReminderPlan(
        organization_id=org_id, user_id=user_id, applicant_id=applicant.id,
        frequency="weekly", due_weekday=6, send_days_before=1,
        send_time=_dt.time(18, 0), timezone="America/Chicago",
        email_enabled=True, sms_enabled=False, is_active=True,
    )
    db.add(plan)
    await db.flush()
    return plan


@pytest.mark.usefixtures("reminders_wired", "audit_listeners")
async def test_rent_reminder_sweep_audits_each_send_as_the_plans_owner(db: AsyncSession) -> None:
    owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
    plan_a = await _reminder_plan(db, user_id=owner_a)
    plan_b = await _reminder_plan(db, user_id=owner_b)

    assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 2

    for plan, owner in ((plan_a, owner_a), (plan_b, owner_b)):
        send = (await db.execute(
            select(RentReminderSend).where(RentReminderSend.plan_id == plan.id),
        )).scalar_one()
        assert send.status == "sent"
        assert await _audit_actors(db, "rent_reminder_sends", send.id, "INSERT") == {str(owner)}
    assert current_user_id.get() is None


# --------------------------------------------------------------------------
# Lease hand-over
# --------------------------------------------------------------------------


async def _renewal(db: AsyncSession, *, user_id: uuid.UUID) -> SignedLease:
    """A current lease whose renewal started Nov 1. Returns the current lease."""
    org_id = uuid.uuid4()
    applicant = Applicant(
        organization_id=org_id, user_id=user_id, stage="lease_signed", legal_name="Tenant",
    )
    db.add(applicant)
    await db.flush()
    parent = SignedLease(
        user_id=user_id, organization_id=org_id, applicant_id=applicant.id,
        kind="imported", status="active",
        starts_on=_dt.date(2026, 1, 1), ends_on=_dt.date(2026, 10, 31),
    )
    db.add(parent)
    await db.flush()
    db.add(SignedLease(
        user_id=user_id, organization_id=org_id, applicant_id=applicant.id,
        kind="imported", status="active", parent_lease_id=parent.id,
        starts_on=_dt.date(2026, 11, 1), ends_on=_dt.date(2027, 10, 31),
    ))
    await db.flush()
    return parent


@pytest.mark.usefixtures("audit_listeners")
async def test_lease_handover_audits_each_ended_lease_as_its_owner(db: AsyncSession) -> None:
    owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
    lease_a = await _renewal(db, user_id=owner_a)
    lease_b = await _renewal(db, user_id=owner_b)
    await db.commit()

    with patch.object(lease_handover_service, "unit_of_work", _session_uow(db)):
        ended = await lease_handover_service.end_replaced_leases(now=AFTER_RENEWAL_START)
    await db.commit()

    assert ended == 2
    for lease, owner in ((lease_a, owner_a), (lease_b, owner_b)):
        await db.refresh(lease)
        assert lease.status == "ended"
        assert await _audit_actors(db, "signed_leases", lease.id, "UPDATE") == {str(owner)}
    assert current_user_id.get() is None


# --------------------------------------------------------------------------
# Channel iCal poll
# --------------------------------------------------------------------------

_FEED = (
    b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//Test//EN\r\n"
    b"BEGIN:VEVENT\r\nUID:booking-1\r\nDTSTART;VALUE=DATE:20261201\r\n"
    b"DTEND;VALUE=DATE:20261205\r\nDTSTAMP:20260429T120000Z\r\nSUMMARY:Reserved\r\n"
    b"END:VEVENT\r\nEND:VCALENDAR\r\n"
)


async def _polled_listing(db: AsyncSession, *, user_id: uuid.UUID) -> uuid.UUID:
    """A listing owned by ``user_id`` with an Airbnb feed to import. Returns the listing id."""
    org_id = uuid.uuid4()
    prop = Property(organization_id=org_id, user_id=user_id, name="Home", address="1 Main St")
    db.add(prop)
    await db.flush()
    listing = Listing(
        organization_id=org_id, user_id=user_id, property_id=prop.id,
        title="Room", monthly_rate=Decimal("1500.00"), room_type="private_room",
        private_bath=False, parking_assigned=False, furnished=True,
        status="active", amenities=[], pets_on_premises=False,
    )
    db.add(listing)
    await db.flush()
    await channel_listing_repo.create(
        db, listing_id=listing.id, channel_id="airbnb",
        external_url=None, external_id=None,
        ical_import_url=f"https://airbnb.com/{listing.id}.ics", ical_import_secret_token=None,
    )
    return listing.id


@pytest.mark.usefixtures("audit_listeners")
async def test_ical_poll_audits_each_listings_blackouts_as_the_listings_owner(
    db: AsyncSession,
) -> None:
    db.add(Channel(id="airbnb", name="Airbnb", supports_ical_export=True, supports_ical_import=True))
    owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
    listing_a = await _polled_listing(db, user_id=owner_a)
    listing_b = await _polled_listing(db, user_id=owner_b)
    await db.commit()

    with (
        patch.object(channel_sync_service, "unit_of_work", _session_uow(db)),
        patch.object(channel_sync_service, "_fetch", AsyncMock(return_value=_FEED)),
    ):
        assert await channel_sync_service.poll_all() == 2
    await db.commit()

    for listing_id, owner in ((listing_a, owner_a), (listing_b, owner_b)):
        blackout = (await db.execute(
            select(ListingBlackout).where(ListingBlackout.listing_id == listing_id),
        )).scalar_one()
        assert await _audit_actors(db, "listing_blackouts", blackout.id, "INSERT") == {str(owner)}
    assert current_user_id.get() is None
