"""Tests for utility_account_service — learn helper + pure normalizers.

The pure normalizers are covered in depth in test_utility_account_link_repo.py;
here we pin learn_account_link's no-op guards, the provider_label fill, and that
auto_learn writes use source='auto_learn'.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.repositories.properties import utility_account_link_repo
from app.services.extraction.utility_account_service import (
    learn_account_link,
    normalize_account_number,
    sender_domain_from_email,
)


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name="6732 Peerless St",
        address="6732 Peerless St",
    )
    db.add(prop)
    await db.flush()
    return prop


class TestNormalizeFns:
    def test_normalize_account_number(self) -> None:
        assert normalize_account_number("  12-3456 .7890 ") == "1234567890"
        assert normalize_account_number("acct123") == "ACCT123"

    def test_sender_domain_from_email(self) -> None:
        assert sender_domain_from_email("update@emailff.att-mail.com") == "att-mail.com"
        assert sender_domain_from_email("x@tmr3.com") == "tmr3.com"
        assert sender_domain_from_email("") is None


class TestLearnAccountLinkNoOps:
    @pytest.mark.asyncio
    async def test_noop_when_sender_domain_falsy(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain=None, account_number="1234567890",
            property_id=prop.id,
        )
        links = await utility_account_link_repo.list_by_property(
            db, organization_id=org_id, property_id=prop.id
        )
        assert links == []

    @pytest.mark.asyncio
    async def test_noop_when_account_number_falsy(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number=None,
            property_id=prop.id,
        )
        links = await utility_account_link_repo.list_by_property(
            db, organization_id=org_id, property_id=prop.id
        )
        assert links == []

    @pytest.mark.asyncio
    async def test_noop_when_account_number_normalizes_to_empty(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        # All separators -> normalizes to "" -> nothing to remember.
        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="--  ..",
            property_id=prop.id,
        )
        links = await utility_account_link_repo.list_by_property(
            db, organization_id=org_id, property_id=prop.id
        )
        assert links == []


class TestLearnAccountLinkWrites:
    @pytest.mark.asyncio
    async def test_writes_auto_learn_with_provider_label(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="12-3456-7890",
            property_id=prop.id,
        )

        link = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id,
            sender_domain="att-mail.com", account_number="1234567890",
        )
        assert link is not None
        assert link.source == "auto_learn"
        assert link.provider_label == "AT&T"
        assert link.property_id == prop.id

    @pytest.mark.asyncio
    async def test_provider_label_null_for_unknown_domain(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="unknown-utility.com", account_number="999",
            property_id=prop.id,
        )

        link = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id,
            sender_domain="unknown-utility.com", account_number="999",
        )
        assert link is not None
        assert link.provider_label is None

    @pytest.mark.asyncio
    async def test_centerpoint_and_houston_water_labels(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="tmr3.com", account_number="111",
            property_id=prop.id,
        )
        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="houstontx.gov", account_number="222",
            property_id=prop.id,
        )

        cp = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id, sender_domain="tmr3.com", account_number="111",
        )
        water = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id, sender_domain="houstontx.gov", account_number="222",
        )
        assert cp is not None and cp.provider_label == "CenterPoint"
        assert water is not None and water.provider_label == "City of Houston Water"
