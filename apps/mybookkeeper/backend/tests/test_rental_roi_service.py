"""Rental ROI against a real database: the repo filters it relies on, and the service end to end."""
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.context import RequestContext
from app.core.mortgage_enums import RATE_TYPE_FIXED
from app.models.mortgage.mortgage import Mortgage
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.mortgage import mortgage_repo
from app.repositories.transactions import summary_repo
from app.services.analytics import rental_roi_service

TODAY = date(2026, 11, 17)
IN_WINDOW = date(2026, 3, 10)


async def _org_and_user(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"roi-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="ROI Org", created_by=user.id)
    db.add(org)
    await db.commit()
    return org.id, user.id


def _property(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    *,
    classification: PropertyClassification = PropertyClassification.INVESTMENT,
    purchase_price: Decimal | None = None,
) -> Property:
    return Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        classification=classification,
        type=PropertyType.LONG_TERM if classification == PropertyClassification.INVESTMENT else None,
        purchase_price=purchase_price,
    )


def _txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
    category: str,
    amount: str,
    *,
    txn_date: date = IN_WINDOW,
    capital: bool = False,
) -> Transaction:
    income = category in {"rental_revenue", "cleaning_fee_revenue"}
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        transaction_date=txn_date,
        tax_year=txn_date.year,
        amount=Decimal(amount),
        transaction_type="income" if income else "expense",
        category=category,
        tags=[category],
        status="approved",
        is_capital_improvement=capital,
        placed_in_service_date=txn_date if capital else None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def _mortgage(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    **fields: object,
) -> Mortgage:
    return Mortgage(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        rate_type=RATE_TYPE_FIXED,
        **fields,
    )


class TestExcludeCapitalImprovements:
    @pytest.mark.asyncio
    async def test_capital_improvements_are_left_out_only_when_asked(self, db: AsyncSession) -> None:
        org_id, user_id = await _org_and_user(db)
        prop = _property(org_id, user_id, "Elm")
        db.add(prop)
        db.add(_txn(org_id, user_id, prop.id, "maintenance", "100.00"))
        db.add(_txn(org_id, user_id, prop.id, "maintenance", "9000.00", capital=True))
        await db.commit()

        def total(rows: object) -> Decimal:
            return sum((Decimal(r.total) for r in rows), Decimal(0))  # type: ignore[attr-defined]

        with_capital = await summary_repo.txn_sum_by_property_month_and_category(db, org_id)
        without = await summary_repo.txn_sum_by_property_month_and_category(
            db, org_id, exclude_capital_improvements=True,
        )
        assert total(with_capital) == Decimal("9100.00")
        assert total(without) == Decimal("100.00")


class TestListActiveForOrg:
    @pytest.mark.asyncio
    async def test_scoped_to_user_and_org_and_skips_paid_off_loans(self, db: AsyncSession) -> None:
        org_id, user_id = await _org_and_user(db)
        other_org, other_user = await _org_and_user(db)
        prop = _property(org_id, user_id, "Elm")
        db.add(prop)
        keep_unknown = _mortgage(org_id, user_id, prop.id)
        keep_paying = _mortgage(
            org_id, user_id, prop.id,
            current_balance_cents=100, statement_date=TODAY, maturity_date=date(2050, 1, 1),
        )
        db.add_all([
            keep_unknown,
            keep_paying,
            _mortgage(org_id, user_id, prop.id, current_balance_cents=0, statement_date=TODAY),
            _mortgage(org_id, user_id, prop.id, maturity_date=date(2026, 11, 16)),
            _mortgage(org_id, user_id, prop.id, deleted_at=datetime.now(timezone.utc)),
            # Same org, another member's loan; and another org entirely.
            _mortgage(org_id, other_user, prop.id),
            _mortgage(other_org, user_id, prop.id),
        ])
        await db.commit()

        loans = await mortgage_repo.list_active_for_org(
            db, user_id=user_id, organization_id=org_id, today=TODAY,
        )
        assert {m.id for m in loans} == {keep_unknown.id, keep_paying.id}

    @pytest.mark.asyncio
    async def test_a_loan_maturing_today_is_still_active(self, db: AsyncSession) -> None:
        org_id, user_id = await _org_and_user(db)
        prop = _property(org_id, user_id, "Elm")
        db.add(prop)
        loan = _mortgage(org_id, user_id, prop.id, maturity_date=TODAY)
        db.add(loan)
        await db.commit()

        loans = await mortgage_repo.list_active_for_org(
            db, user_id=user_id, organization_id=org_id, today=TODAY,
        )
        assert [m.id for m in loans] == [loan.id]


@pytest.fixture()
def roi_sessions(monkeypatch: pytest.MonkeyPatch, _db_engine: AsyncEngine) -> None:
    @asynccontextmanager
    async def _factory() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            yield session

    monkeypatch.setattr(rental_roi_service, "AsyncSessionLocal", _factory)


class TestRentedHome:
    @pytest.mark.asyncio
    async def test_a_home_that_collects_rent_is_included_and_marked(
        self, db: AsyncSession, roi_sessions: None,
    ) -> None:
        org_id, user_id = await _org_and_user(db)
        home = _property(org_id, user_id, "Home", classification=PropertyClassification.PRIMARY_RESIDENCE)
        rental = _property(org_id, user_id, "Rental")
        db.add_all([home, rental])
        db.add_all([
            _txn(org_id, user_id, home.id, "rental_revenue", "12000.00"),
            _txn(org_id, user_id, home.id, "utilities", "1200.00"),
        ])
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
        result = await rental_roi_service.get_rental_roi(ctx, target_return_pct=Decimal("8"), today=TODAY)

        by_name = {p.property_name: p for p in result.properties}
        assert by_name["Home"].is_personal_home is True
        assert by_name["Home"].actual_revenue_monthly_cents == 100_000
        assert by_name["Home"].break_even_monthly_cents == 10_000
        assert by_name["Rental"].is_personal_home is False
        assert result.summary.property_count == 2

    @pytest.mark.asyncio
    async def test_a_home_with_no_rent_stays_out(self, db: AsyncSession, roi_sessions: None) -> None:
        org_id, user_id = await _org_and_user(db)
        home = _property(org_id, user_id, "Home", classification=PropertyClassification.PRIMARY_RESIDENCE)
        db.add(home)
        db.add(_txn(org_id, user_id, home.id, "utilities", "1200.00"))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
        result = await rental_roi_service.get_rental_roi(ctx, target_return_pct=Decimal("8"), today=TODAY)

        assert result.properties == []


class TestGetRentalRoi:
    @pytest.mark.asyncio
    async def test_portfolio_end_to_end(self, db: AsyncSession, roi_sessions: None) -> None:
        org_id, user_id = await _org_and_user(db)
        priced = _property(org_id, user_id, "Alpha", purchase_price=Decimal("250000"))
        unpriced = _property(org_id, user_id, "Beta")
        home = _property(org_id, user_id, "Home", classification=PropertyClassification.PRIMARY_RESIDENCE)
        db.add_all([priced, unpriced, home])
        db.add_all([
            _txn(org_id, user_id, priced.id, "rental_revenue", "24000.00"),
            _txn(org_id, user_id, priced.id, "utilities", "1200.00"),
            # Before the window: ignored.
            _txn(org_id, user_id, priced.id, "utilities", "99999.00", txn_date=date(2025, 10, 31)),
            # A capital improvement: ignored.
            _txn(org_id, user_id, priced.id, "furnishings", "5000.00", capital=True),
            _txn(org_id, user_id, unpriced.id, "mortgage_interest", "12000.00"),
            _txn(org_id, user_id, unpriced.id, "rental_revenue", "12000.00"),
            _txn(org_id, user_id, home.id, "utilities", "3600.00"),
            _txn(org_id, user_id, None, "rental_revenue", "1200.00"),
        ])
        db.add(_mortgage(
            org_id, user_id, priced.id,
            monthly_principal_cents=50_000, monthly_interest_cents=100_000,
            original_principal_cents=20_000_000,
        ))
        await db.commit()

        ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
        result = await rental_roi_service.get_rental_roi(ctx, target_return_pct=Decimal("8"), today=TODAY)

        assert result.window_start == date(2025, 11, 1)
        assert result.window_end == date(2026, 10, 31)
        assert result.has_transactions is True
        assert result.unassigned_revenue_monthly_cents == 10000
        assert [p.property_name for p in result.properties] == ["Alpha", "Beta"]

        alpha, beta = result.properties
        assert alpha.mortgage_source == "records"
        assert alpha.break_even_monthly_cents == 160000
        assert alpha.target_monthly_cents == 193333
        assert alpha.actual_revenue_monthly_cents == 200000
        assert alpha.gap_basis == "target"
        assert alpha.gap_monthly_cents == 6667

        assert beta.mortgage_source == "transactions"
        assert beta.has_purchase_price is False
        assert beta.target_monthly_cents is None
        assert beta.break_even_monthly_cents == 100000
        assert beta.gap_basis == "break_even"
        assert beta.gap_monthly_cents == 0

        summary = result.summary
        assert summary.property_count == 2
        assert summary.properties_with_target == 1
        assert summary.total_break_even_monthly_cents == 260000
        assert summary.total_target_monthly_cents == 193333
        assert summary.total_actual_revenue_monthly_cents == 300000
        # Not every property has a target, so the gap is against break-even.
        assert summary.gap_basis == "break_even"
        assert summary.total_gap_monthly_cents == 40000

    @pytest.mark.asyncio
    async def test_no_transactions_and_no_rentals(self, db: AsyncSession, roi_sessions: None) -> None:
        org_id, user_id = await _org_and_user(db)
        ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
        result = await rental_roi_service.get_rental_roi(ctx, target_return_pct=Decimal("8"), today=TODAY)
        assert result.has_transactions is False
        assert result.properties == []
        assert result.summary.property_count == 0
        assert result.summary.gap_basis == "break_even"
