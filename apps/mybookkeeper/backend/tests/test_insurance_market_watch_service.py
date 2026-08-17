"""Tests for the dwelling rate watch's orchestration.

The matching arithmetic is covered in
``test_insurance_carrier_filing_match.py``; the feed reader in
``test_tdi_rate_filings_client.py``. What these pin is what the service does
around them: which policies are looked at, how an unmatchable one is explained
instead of dropped, what the market view deduplicates, and the outage
behaviour — a TDI failure must degrade into a visible "nothing was checked",
never into a silent "no increases filed".

The service opens its own session via ``unit_of_work()``; ``_make_fake_uow``
patches it to yield the in-memory SQLite test session instead.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tdi_rate_filings_constants import (
    MAX_MARKET_FILINGS,
    REASON_FEED_DOWN,
    REASON_NO_CARRIER,
    REASON_NO_FILINGS,
)
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories.insurance import insurance_policy_repo
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling
from app.services.insurance import insurance_market_watch_service
from app.services.insurance.tdi_rate_filings_client import (
    RateFilingFeedUnavailableError,
)

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 8, 17)

_UOW = "app.services.insurance.insurance_market_watch_service.unit_of_work"
_FETCH = "app.services.insurance.insurance_market_watch_service.fetch_dwelling_filings"

# 6738 Peerless: SafePoint, $2,410 annual, renews 23 days after the carrier's
# filed increase reaches renewing policies.
SAFEPOINT_PREMIUM_CENTS = 241_000
SAFEPOINT_RENEWAL = _dt.date(2026, 9, 24)


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session

    return _fake_uow


def _fetching(filings: list[InsuranceRateFiling]):
    async def _fetch():
        return filings

    return _fetch


def _failing_fetch():
    async def _fetch():
        raise RateFilingFeedUnavailableError("feed is unreachable")

    return _fetch


def _filing(
    *,
    company: str = "SAFEPOINT INSURANCE COMPANY",
    product: str | None = "TX DWO",
    pct: float | None = 11.1,
    filed: _dt.date = _dt.date(2026, 5, 28),
    renewal: _dt.date | None = _dt.date(2026, 9, 1),
    in_force: bool = True,
    pending: bool = False,
) -> InsuranceRateFiling:
    return InsuranceRateFiling(
        serff_id=f"SERFF-{company[:8]}-{filed}-{product}",
        company_name=company,
        product_name=product,
        percent_change=pct,
        filed_date=filed,
        effective_date_renewal=renewal,
        is_in_force=in_force,
        is_pending=pending,
    )


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str,
) -> Property:
    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name=name,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _make_policy(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    policy_name: str = "Dwelling DP-3",
    carrier: str | None = "SafePoint",
    premium_cents: int | None = SAFEPOINT_PREMIUM_CENTS,
    premium_frequency: str | None = "annual",
    expiration_date: _dt.date | None = SAFEPOINT_RENEWAL,
):
    return await insurance_policy_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        property_id=property_id,
        policy_name=policy_name,
        carrier=carrier,
        premium_cents=premium_cents,
        premium_frequency=premium_frequency,
        expiration_date=expiration_date,
    )


async def _watch(db: AsyncSession, org: Organization, user: User, filings):
    fetch = filings if callable(filings) else _fetching(filings)
    with patch(_UOW, _make_fake_uow(db)), patch(_FETCH, fetch):
        return await insurance_market_watch_service.get_market_watch(
            user_id=user.id, organization_id=org.id, today=TODAY,
        )


class TestPolicyOutlook:
    async def test_projects_the_safepoint_increase_onto_the_renewal(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The case the feature exists for: an increase filed before renewal."""
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert len(result.outlooks) == 1
        outlook = result.outlooks[0]
        assert outlook.property_name == "6738 Peerless St"
        assert outlook.projected_change_pct == 11.1
        assert outlook.current_premium_cents == SAFEPOINT_PREMIUM_CENTS
        assert outlook.projected_premium_cents == 267_751
        assert outlook.unavailable_reason is None
        assert result.has_any_increase is True

    async def test_a_filing_effective_after_renewal_hits_the_next_term(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )

        result = await _watch(
            db, test_org, test_user, [_filing(renewal=_dt.date(2026, 12, 1))],
        )

        assert result.outlooks[0].projected_change_pct is None
        assert result.outlooks[0].unavailable_reason == REASON_NO_FILINGS
        assert result.has_any_increase is False

    async def test_an_unmatched_carrier_says_so_rather_than_looking_clear(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Swyfft files nothing under that name — silence would misread."""
        prop = await _make_property(db, test_org.id, test_user.id, "6734 Peerless St")
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            carrier="Benchmark/Swyfft",
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert result.outlooks[0].filings == []
        assert result.outlooks[0].unavailable_reason == REASON_NO_FILINGS

    async def test_a_policy_with_no_carrier_says_which_field_is_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id, "6732 Peerless St")
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            carrier=None,
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert result.outlooks[0].unavailable_reason == REASON_NO_CARRIER

    async def test_a_monthly_premium_is_annualised_before_projection(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Projecting the billed figure would report a twelfth of the truth."""
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            premium_cents=20_000,
            premium_frequency="monthly",
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert result.outlooks[0].current_premium_cents == 240_000
        assert result.outlooks[0].projected_premium_cents == 266_640

    async def test_an_expired_policy_is_not_measured(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id, "Sold house")
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            expiration_date=_dt.date(2025, 1, 1),
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert result.outlooks == []

    async def test_a_policy_with_no_expiration_is_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """An unknown end date is not evidence the policy lapsed."""
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        await _make_policy(
            db,
            org_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            expiration_date=None,
        )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert len(result.outlooks) == 1

    async def test_soonest_renewal_reads_first(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        for name, expires in [
            ("Later policy", _dt.date(2027, 6, 1)),
            ("Sooner policy", _dt.date(2026, 9, 24)),
            ("Undated policy", None),
        ]:
            await _make_policy(
                db,
                org_id=test_org.id,
                user_id=test_user.id,
                property_id=prop.id,
                policy_name=name,
                expiration_date=expires,
            )

        result = await _watch(db, test_org, test_user, [_filing()])

        assert [o.policy_name for o in result.outlooks] == [
            "Sooner policy",
            "Later policy",
            "Undated policy",
        ]


class TestMarketView:
    async def test_shows_one_row_per_carrier_newest_first(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """A carrier files several programs a year; repeats crowd out the rest."""
        filings = [
            _filing(product="TX DWO", filed=_dt.date(2026, 5, 28)),
            _filing(product="TX Business Advantage", filed=_dt.date(2026, 2, 19)),
            _filing(
                company="FOREMOST LLOYDS OF TEXAS",
                product="Dwelling Program - Landlord",
                pct=0.0,
                filed=_dt.date(2026, 7, 24),
            ),
        ]

        result = await _watch(db, test_org, test_user, filings)

        assert [(f.company_name, f.filed_date) for f in result.market_filings] == [
            ("FOREMOST LLOYDS OF TEXAS", _dt.date(2026, 7, 24)),
            ("SAFEPOINT INSURANCE COMPANY", _dt.date(2026, 5, 28)),
        ]

    async def test_keeps_a_carrier_holding_rates_flat(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Zero percent is the shortlist to call, not noise to filter out."""
        result = await _watch(
            db, test_org, test_user, [_filing(company="FLAT CARRIER", pct=0.0)],
        )

        assert [f.percent_change for f in result.market_filings] == [0.0]

    async def test_keeps_pending_filings_flagged_as_proposed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        result = await _watch(
            db, test_org, test_user, [_filing(in_force=False, pending=True)],
        )

        assert len(result.market_filings) == 1
        assert result.market_filings[0].is_pending is True
        assert result.market_filings[0].is_in_force is False

    async def test_drops_a_withdrawn_filing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Closed without ever applying — it is not market activity."""
        result = await _watch(
            db, test_org, test_user, [_filing(in_force=False, pending=False)],
        )

        assert result.market_filings == []

    async def test_drops_a_stale_filing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        result = await _watch(
            db, test_org, test_user, [_filing(filed=_dt.date(2017, 5, 1))],
        )

        assert result.market_filings == []

    async def test_caps_the_market_list(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        filings = [
            _filing(company=f"CARRIER {index} GROUP", filed=_dt.date(2026, 6, 1))
            for index in range(MAX_MARKET_FILINGS + 10)
        ]

        result = await _watch(db, test_org, test_user, filings)

        assert len(result.market_filings) == MAX_MARKET_FILINGS


class TestFeedOutage:
    async def test_an_outage_explains_itself_on_every_policy(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The one failure mode that must never look like good news."""
        prop = await _make_property(db, test_org.id, test_user.id, "6738 Peerless St")
        await _make_policy(
            db, org_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )

        result = await _watch(db, test_org, test_user, _failing_fetch())

        assert result.feed_unavailable_reason == REASON_FEED_DOWN
        assert result.outlooks[0].unavailable_reason == REASON_FEED_DOWN
        assert result.outlooks[0].projected_change_pct is None
        assert result.market_filings == []
        assert result.has_any_increase is False
