"""The audit listener masks bearer tokens: values that let whoever holds them in.

An organization invite's token, a welcome manual's guest share token, and a
channel listing's public iCal feed token and the secret-bearing feed URL and
token it imports from. Each must reach audit_logs as ``***``, on insert and on
update, and never in cleartext.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from platform_shared.core.audit_erasure_constants import MASKED_AUDIT_VALUE
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.organization.organization_invite import OrganizationInvite
from app.models.properties.property import Property
from app.models.system.audit_log import AuditLog
from app.models.user.user import User
from app.models.welcome_manuals.welcome_manual import WelcomeManual

_INVITE_TOKEN = "invite-bearer-token-cleartext"
_SHARE_TOKEN = "share-bearer-token-cleartext"
_EXPORT_TOKEN = "ical-export-token-cleartext"
_IMPORT_SECRET = "ical-import-secret-cleartext"
_IMPORT_URL = "https://airbnb.example/calendar/ical/1.ics?s=ical-import-url-secret"
_SECRETS = (_INVITE_TOKEN, _SHARE_TOKEN, _EXPORT_TOKEN, _IMPORT_SECRET, _IMPORT_URL)


@pytest.fixture(autouse=True)
def _audit(audit_listeners):
    """Attach the audit listener for this module's tests only."""


async def _rows(db: AsyncSession, table: str, record_id: uuid.UUID, operation: str) -> list[AuditLog]:
    return list((await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == table,
            AuditLog.record_id == str(record_id),
            AuditLog.operation == operation,
        ),
    )).scalars().all())


def _assert_no_cleartext(rows: list[AuditLog]) -> None:
    for row in rows:
        for value in (row.old_value, row.new_value):
            if value is not None:
                assert not any(secret in value for secret in _SECRETS)


async def _channel_listing(db: AsyncSession, user: User, org: Organization) -> ChannelListing:
    prop = Property(id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Maple House")
    listing = Listing(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, property_id=prop.id,
        title="Sunny Room", monthly_rate=Decimal("1200.00"), room_type="private_room",
    )
    channel_listing = ChannelListing(
        id=uuid.uuid4(), listing_id=listing.id, channel_id="airbnb",
        external_url="https://airbnb.example/rooms/1",
        ical_import_url=_IMPORT_URL,
        ical_import_secret_token=_IMPORT_SECRET,
        ical_export_token=_EXPORT_TOKEN,
    )
    db.add_all([prop, listing, channel_listing])
    await db.commit()
    return channel_listing


class TestBearerTokenAuditMasking:
    @pytest.mark.asyncio
    async def test_invite_token_masked(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        invite = OrganizationInvite(
            id=uuid.uuid4(), organization_id=test_org.id, email="invitee@example.com",
            org_role="user", invited_by=test_user.id, token=_INVITE_TOKEN,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite)
        await db.commit()

        rows = await _rows(db, "organization_invites", invite.id, "INSERT")
        values = {r.field_name: r.new_value for r in rows}
        assert values["token"] == MASKED_AUDIT_VALUE
        assert values["org_role"] == "user"
        _assert_no_cleartext(rows)

    @pytest.mark.asyncio
    async def test_share_token_masked_on_insert_and_update(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = WelcomeManual(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            title="Guide", share_token=_SHARE_TOKEN,
        )
        db.add(manual)
        await db.commit()
        manual.share_token = "share-bearer-token-rotated"
        await db.commit()

        inserted = await _rows(db, "welcome_manuals", manual.id, "INSERT")
        updated = await _rows(db, "welcome_manuals", manual.id, "UPDATE")
        assert {r.field_name: r.new_value for r in inserted}["share_token"] == MASKED_AUDIT_VALUE
        change = next(r for r in updated if r.field_name == "share_token")
        assert (change.old_value, change.new_value) == (MASKED_AUDIT_VALUE, MASKED_AUDIT_VALUE)
        _assert_no_cleartext(inserted + updated)
        assert all("rotated" not in (r.new_value or "") for r in updated)

    @pytest.mark.asyncio
    async def test_channel_listing_feed_secrets_masked(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        channel_listing = await _channel_listing(db, test_user, test_org)

        rows = await _rows(db, "channel_listings", channel_listing.id, "INSERT")
        values = {r.field_name: r.new_value for r in rows}
        for field in ("ical_export_token", "ical_import_secret_token", "ical_import_url"):
            assert values[field] == MASKED_AUDIT_VALUE
        assert values["external_url"] == "https://airbnb.example/rooms/1"
        _assert_no_cleartext(rows)

    @pytest.mark.asyncio
    async def test_clearing_a_feed_secret_records_null(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        channel_listing = await _channel_listing(db, test_user, test_org)
        channel_listing.ical_import_secret_token = None
        await db.commit()

        updated = await _rows(db, "channel_listings", channel_listing.id, "UPDATE")
        change = next(r for r in updated if r.field_name == "ical_import_secret_token")
        assert (change.old_value, change.new_value) == (MASKED_AUDIT_VALUE, None)
