"""The Property P&L must classify money exactly like the Dashboard summary.

Revenue and expenses come from the category tags (REVENUE_TAGS / EXPENSE_TAGS).
Security deposits and uncategorized rows are neutral, so they must never move a
property's revenue, expenses or net, and the P&L totals must equal the summary.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions import property_pnl_service, summary_service

SINCE = date(2026, 1, 1)
UNTIL = date(2026, 12, 31)


async def _seed_org(db: AsyncSession) -> tuple[User, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"pnl-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="PnL Org", created_by=user.id)
    db.add(org)
    await db.commit()
    return user, org.id


def _txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    category: str,
    transaction_type: str,
    amount: str,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        amount=Decimal(amount),
        category=category,
        transaction_type=transaction_type,
        tax_relevant=False,
        transaction_date=date(2026, 6, 15),
        tax_year=2026,
        status="approved",
        vendor="Test Vendor",
        tags=[category],
    )


async def _seed_property_with_mixed_rows(
    db: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    user, org_id = await _seed_org(db)
    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user.id,
        name="Maple", address="1 Maple St",
    )
    db.add(prop)
    db.add_all([
        _txn(org_id, user.id, prop.id, "rental_revenue", "income", "1000.00"),
        _txn(org_id, user.id, prop.id, "maintenance", "expense", "200.00"),
        _txn(org_id, user.id, prop.id, "security_deposit", "income", "2000.00"),
        _txn(org_id, user.id, prop.id, "uncategorized", "expense", "75.00"),
    ])
    await db.commit()
    return org_id, user.id, prop.id


class TestPropertyPnlClassification:
    @pytest.mark.asyncio
    async def test_deposit_and_uncategorized_are_neutral(self, db: AsyncSession) -> None:
        org_id, _, prop_id = await _seed_property_with_mixed_rows(db)

        pnl = await property_pnl_service._compute_pnl(db, org_id, since=SINCE, until=UNTIL)

        entry = next(p for p in pnl.properties if p.property_id == prop_id)
        assert entry.revenue_cents == 100_000
        assert entry.expenses_cents == 20_000
        assert entry.net_cents == 80_000
        assert [(b.category, b.amount_cents) for b in entry.expense_breakdown] == [
            ("maintenance", 20_000),
        ]

    @pytest.mark.asyncio
    async def test_deposit_only_property_has_no_revenue(self, db: AsyncSession) -> None:
        user, org_id = await _seed_org(db)
        prop = Property(
            id=uuid.uuid4(), organization_id=org_id, user_id=user.id,
            name="Oak", address="2 Oak St",
        )
        db.add(prop)
        db.add(_txn(org_id, user.id, prop.id, "security_deposit", "income", "2000.00"))
        await db.commit()

        pnl = await property_pnl_service._compute_pnl(db, org_id, since=SINCE, until=UNTIL)

        assert pnl.total_revenue_cents == 0
        assert pnl.total_expenses_cents == 0
        assert pnl.total_net_cents == 0

    @pytest.mark.asyncio
    async def test_totals_equal_dashboard_summary(self, db: AsyncSession) -> None:
        org_id, user_id, prop_id = await _seed_property_with_mixed_rows(db)
        ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role="owner")

        @asynccontextmanager
        async def _session():
            yield db

        pnl = await property_pnl_service._compute_pnl(db, org_id, since=SINCE, until=UNTIL)
        with patch("app.services.transactions.summary_service.AsyncSessionLocal", _session):
            summary = await summary_service.get_summary(
                ctx,
                start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
                end_date=datetime(2026, 12, 31, tzinfo=timezone.utc),
                property_ids=[prop_id],
            )

        assert pnl.total_revenue_cents == round(float(summary["revenue"]) * 100)
        assert pnl.total_expenses_cents == round(float(summary["expenses"]) * 100)
        assert pnl.total_net_cents == round(float(summary["profit"]) * 100)
