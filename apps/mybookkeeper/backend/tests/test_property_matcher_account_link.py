"""Tests for resolve_property_id's account-link path (utility bill -> property).

Covers the new flow added on top of the address matcher:
  - account-link lookup resolves an address-less notification to the learned
    property
  - an address-matched bill that also exposes an account number auto-learns the
    link
  - the GUARD: utilities + account_number + an UNMATCHED address must NOT
    auto-create a junk property (returns None)
  - non-utility / no-account documents still auto-create as before
  - the upload-path call shape (no new kwargs) is unaffected
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.models.properties.utility_account_link import UtilityAccountLink
from app.repositories.properties import utility_account_link_repo
from app.services.extraction.property_matcher_service import resolve_property_id


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, address: str
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=address,
        address=address,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _count_properties(db: AsyncSession, org_id: uuid.UUID) -> int:
    rows = (
        await db.execute(
            select(Property).where(Property.organization_id == org_id)
        )
    ).scalars().all()
    return len(rows)


class TestAccountLinkLookup:
    @pytest.mark.asyncio
    async def test_address_less_notification_resolves_via_learned_link(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St Houston TX")
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop.id, source="auto_learn",
        )

        # A thin notification: no address, only an account number (raw, dashed).
        resolved = await resolve_property_id(
            None, None, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number="12-3456-7890", sender_domain="att-mail.com",
        )
        assert resolved == prop.id

    @pytest.mark.asyncio
    async def test_no_link_no_address_returns_none_and_creates_nothing(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        resolved = await resolve_property_id(
            None, None, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number="1234567890", sender_domain="att-mail.com",
        )
        assert resolved is None
        assert await _count_properties(db, org_id) == 0


class TestAutoLearnOnAddressMatch:
    @pytest.mark.asyncio
    async def test_address_match_with_account_learns_link(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St Houston TX")

        resolved = await resolve_property_id(
            "6732 Peerless St Houston TX", None, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number="12-3456-7890", sender_domain="att-mail.com",
        )
        assert resolved == prop.id

        # A link was learned, normalized, with the AT&T provider label.
        link = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id,
            sender_domain="att-mail.com", account_number="1234567890",
        )
        assert link is not None
        assert link.property_id == prop.id
        assert link.source == "auto_learn"
        assert link.provider_label == "AT&T"

    @pytest.mark.asyncio
    async def test_explicit_property_with_account_learns_link(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St Houston TX")

        resolved = await resolve_property_id(
            None, prop.id, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number="1234567890", sender_domain="att-mail.com",
        )
        assert resolved == prop.id

        link = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id,
            sender_domain="att-mail.com", account_number="1234567890",
        )
        assert link is not None
        assert link.property_id == prop.id


class TestAutoCreateGuard:
    @pytest.mark.asyncio
    async def test_utilities_plus_account_no_match_returns_none_no_create(
        self, db: AsyncSession
    ) -> None:
        """A utility notification whose (mailing) address matches nothing and
        carries an account number must NOT mint a junk property."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        resolved = await resolve_property_id(
            "PO Box 5000 Carol Stream IL 60197",  # mailing address, not a property
            None, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number="1234567890", sender_domain="att-mail.com",
        )
        assert resolved is None
        assert await _count_properties(db, org_id) == 0

    @pytest.mark.asyncio
    async def test_utilities_without_account_still_auto_creates(
        self, db: AsyncSession
    ) -> None:
        """A real utility bill (service address, no account number) keeps the
        existing auto-create behavior — the guard only fires WITH an account."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        resolved = await resolve_property_id(
            "9001 Westheimer Rd Houston TX", None, org_id, db,
            user_id=user_id, tags=["utilities"],
            account_number=None, sender_domain=None,
        )
        assert resolved is not None
        assert await _count_properties(db, org_id) == 1

    @pytest.mark.asyncio
    async def test_non_utility_with_account_still_auto_creates(
        self, db: AsyncSession
    ) -> None:
        """The guard is utilities-specific: a property-related non-utility tag
        with an account number still auto-creates (guard does not fire)."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        resolved = await resolve_property_id(
            "9001 Westheimer Rd Houston TX", None, org_id, db,
            user_id=user_id, tags=["insurance"],
            account_number="POL-998877", sender_domain="someinsurer.com",
        )
        assert resolved is not None
        assert await _count_properties(db, org_id) == 1


class TestUploadPathUnchanged:
    @pytest.mark.asyncio
    async def test_no_new_kwargs_behaves_as_before(self, db: AsyncSession) -> None:
        """The document-upload call site passes no account/sender kwargs — the
        defaults (None) must keep the old behavior: match an existing property,
        and never touch the link table."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, "6732 Peerless St Houston TX")

        resolved = await resolve_property_id(
            "6732 Peerless St Houston TX", None, org_id, db,
            user_id=user_id, tags=["utilities"],
        )
        assert resolved == prop.id

        # No link was created on the upload path.
        rows = (
            await db.execute(
                select(UtilityAccountLink).where(
                    UtilityAccountLink.organization_id == org_id
                )
            )
        ).scalars().all()
        assert list(rows) == []

    @pytest.mark.asyncio
    async def test_no_new_kwargs_auto_creates_as_before(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        resolved = await resolve_property_id(
            "9001 Westheimer Rd Houston TX", None, org_id, db,
            user_id=user_id, tags=["utilities"],
        )
        assert resolved is not None
        assert await _count_properties(db, org_id) == 1
