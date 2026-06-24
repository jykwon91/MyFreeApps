"""Tests for utility_account_link_repo — learned utility account -> property.

Covers the full dedup matrix on the (organization_id, sender_domain,
account_number) unique key plus the normalization-parity that makes the
equality lookup hold. The service (utility_account_service) owns the
"manual_link is authoritative" rule; one test here pins that the repo upsert
itself is a straight update (the guard lives a layer up).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.models.properties.utility_account_link import UtilityAccountLink
from app.repositories.properties import utility_account_link_repo
from app.services.extraction.utility_account_service import (
    learn_account_link,
    normalize_account_number,
    sender_domain_from_email,
)


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str = "6732 Peerless St"
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        address=name,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _all_links(db: AsyncSession, org_id: uuid.UUID) -> list[UtilityAccountLink]:
    rows = (
        await db.execute(
            select(UtilityAccountLink).where(
                UtilityAccountLink.organization_id == org_id
            )
        )
    ).scalars().all()
    return list(rows)


class TestNormalization:
    def test_account_number_strips_separators_and_uppercases(self) -> None:
        assert normalize_account_number("12-3456-7890") == "1234567890"
        assert normalize_account_number("1234567890") == "1234567890"
        assert normalize_account_number("ab 12.34-56") == "AB123456"

    def test_dashed_and_plain_map_to_one_key(self) -> None:
        assert normalize_account_number("12-3456-7890") == normalize_account_number(
            "1234567890"
        )

    def test_sender_domain_collapses_att_submailers(self) -> None:
        assert sender_domain_from_email("update@emailff.att-mail.com") == "att-mail.com"
        assert sender_domain_from_email("update@emaildl.att-mail.com") == "att-mail.com"

    def test_sender_domain_two_label_unchanged(self) -> None:
        assert sender_domain_from_email("centerpoint.energy@tmr3.com") == "tmr3.com"
        assert (
            sender_domain_from_email("cityofhoustonwaterbill@houstontx.gov")
            == "houstontx.gov"
        )

    def test_sender_domain_none_for_garbage(self) -> None:
        assert sender_domain_from_email(None) is None
        assert sender_domain_from_email("not-an-email") is None


class TestUpsertDedupMatrix:
    @pytest.mark.asyncio
    async def test_same_key_idempotent_upsert(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        for _ in range(2):
            await utility_account_link_repo.upsert_link(
                db,
                organization_id=org_id,
                user_id=user_id,
                sender_domain="att-mail.com",
                account_number="1234567890",
                property_id=prop.id,
                source="auto_learn",
            )

        rows = await _all_links(db, org_id)
        assert len(rows) == 1
        assert rows[0].property_id == prop.id

    @pytest.mark.asyncio
    async def test_same_key_different_property_updates_property_id(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop_a = await _make_property(db, org_id, user_id, "A")
        prop_b = await _make_property(db, org_id, user_id, "B")

        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop_a.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop_b.id, source="auto_learn",
        )

        rows = await _all_links(db, org_id)
        assert len(rows) == 1
        assert rows[0].property_id == prop_b.id

    @pytest.mark.asyncio
    async def test_same_account_different_sender_domain_two_rows(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="tmr3.com", account_number="1234567890",
            property_id=prop.id, source="auto_learn",
        )

        rows = await _all_links(db, org_id)
        assert len(rows) == 2
        assert {r.sender_domain for r in rows} == {"att-mail.com", "tmr3.com"}

    @pytest.mark.asyncio
    async def test_same_domain_different_account_two_rows(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1111111111",
            property_id=prop.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="2222222222",
            property_id=prop.id, source="auto_learn",
        )

        rows = await _all_links(db, org_id)
        assert len(rows) == 2
        assert {r.account_number for r in rows} == {"1111111111", "2222222222"}

    @pytest.mark.asyncio
    async def test_different_org_same_key_two_rows(self, db: AsyncSession) -> None:
        org_a, org_b, user_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        prop_a = await _make_property(db, org_a, user_id, "A")
        prop_b = await _make_property(db, org_b, user_id, "B")

        await utility_account_link_repo.upsert_link(
            db, organization_id=org_a, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop_a.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_b, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=prop_b.id, source="auto_learn",
        )

        assert len(await _all_links(db, org_a)) == 1
        assert len(await _all_links(db, org_b)) == 1
        # And tenant isolation on get_by_account.
        link_b = await utility_account_link_repo.get_by_account(
            db, organization_id=org_b,
            sender_domain="att-mail.com", account_number="1234567890",
        )
        assert link_b is not None
        assert link_b.property_id == prop_b.id

    @pytest.mark.asyncio
    async def test_manual_link_not_clobbered_by_auto_learn(
        self, db: AsyncSession
    ) -> None:
        """The 'manual_link is authoritative' rule lives in the service.

        learn_account_link (auto_learn) must NOT overwrite a manual_link row.
        """
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        manual_prop = await _make_property(db, org_id, user_id, "Manual")
        auto_prop = await _make_property(db, org_id, user_id, "Auto")

        # Host manually links the account to manual_prop.
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1234567890",
            property_id=manual_prop.id, source="manual_link",
        )

        # A later auto-learn from an address-matched bill points elsewhere — it
        # must be ignored.
        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="12-3456-7890",
            property_id=auto_prop.id,
        )

        rows = await _all_links(db, org_id)
        assert len(rows) == 1
        assert rows[0].source == "manual_link"
        assert rows[0].property_id == manual_prop.id


class TestNormalizationParityOnLearnAndLookup:
    @pytest.mark.asyncio
    async def test_dashed_learn_matches_plain_lookup(self, db: AsyncSession) -> None:
        """A learn-write with "12-3456-7890" must resolve a "1234567890" lookup."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        await learn_account_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="12-3456-7890",
            property_id=prop.id,
        )

        link = await utility_account_link_repo.get_by_account(
            db, organization_id=org_id,
            sender_domain="att-mail.com",
            account_number=normalize_account_number("1234567890"),
        )
        assert link is not None
        assert link.property_id == prop.id
        assert link.account_number == "1234567890"

    @pytest.mark.asyncio
    async def test_both_att_submailers_collapse_to_one_key(
        self, db: AsyncSession
    ) -> None:
        """emailff. and emaildl. both -> att-mail.com -> one learned row."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        for sender in (
            "update@emailff.att-mail.com",
            "update@emaildl.att-mail.com",
        ):
            domain = sender_domain_from_email(sender)
            await learn_account_link(
                db, organization_id=org_id, user_id=user_id,
                sender_domain=domain, account_number="1234567890",
                property_id=prop.id,
            )

        rows = await _all_links(db, org_id)
        assert len(rows) == 1
        assert rows[0].sender_domain == "att-mail.com"


class TestListByProperty:
    @pytest.mark.asyncio
    async def test_lists_links_for_property(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)
        other = await _make_property(db, org_id, user_id, "Other")

        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="att-mail.com", account_number="1111111111",
            property_id=prop.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="tmr3.com", account_number="2222222222",
            property_id=prop.id, source="auto_learn",
        )
        await utility_account_link_repo.upsert_link(
            db, organization_id=org_id, user_id=user_id,
            sender_domain="houstontx.gov", account_number="3333333333",
            property_id=other.id, source="auto_learn",
        )

        links = await utility_account_link_repo.list_by_property(
            db, organization_id=org_id, property_id=prop.id
        )
        assert len(links) == 2
        assert {l.sender_domain for l in links} == {"att-mail.com", "tmr3.com"}
