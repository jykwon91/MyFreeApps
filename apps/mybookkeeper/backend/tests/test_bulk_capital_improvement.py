"""Marking many expenses as capital improvements at once, against the real table constraint."""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.services.transactions import transaction_service

PAID_ON = date(2025, 1, 27)


async def _row(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, transaction_type: str = "expense",
) -> Transaction:
    txn = Transaction(
        organization_id=org_id,
        user_id=user_id,
        transaction_date=PAID_ON,
        tax_year=2025,
        vendor="A to Z Services",
        amount=Decimal("100.00"),
        transaction_type=transaction_type,
        category="contract_work" if transaction_type == "expense" else "rental_revenue",
        status="approved",
    )
    await transaction_repo.create(db, txn)
    await db.commit()
    await db.refresh(txn)
    return txn


@pytest.fixture
def ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(organization_id=test_org.id, user_id=test_user.id, org_role="owner")


@pytest.fixture
def service_db(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db
        await db.commit()

    with patch("app.services.transactions.transaction_service.unit_of_work", _fake):
        yield db


class TestBulkCapitalImprovement:
    @pytest.mark.asyncio
    async def test_marks_every_expense_with_its_payment_date(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        rows = [await _row(service_db, test_org.id, test_user.id) for _ in range(2)]

        result = await transaction_service.bulk_set_capital_improvement(ctx, [r.id for r in rows], True)

        assert result == {"updated": 2, "skipped": 0}
        for row in rows:
            await service_db.refresh(row)
            assert row.is_capital_improvement is True
            assert row.placed_in_service_date == PAID_ON

    @pytest.mark.asyncio
    async def test_keeps_a_date_already_chosen(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        row = await _row(service_db, test_org.id, test_user.id)
        row.is_capital_improvement = True
        row.placed_in_service_date = date(2025, 4, 1)
        await service_db.commit()

        await transaction_service.bulk_set_capital_improvement(ctx, [row.id], True)

        await service_db.refresh(row)
        assert row.placed_in_service_date == date(2025, 4, 1)

    @pytest.mark.asyncio
    async def test_unmarking_clears_the_date(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        row = await _row(service_db, test_org.id, test_user.id)
        await transaction_service.bulk_set_capital_improvement(ctx, [row.id], True)

        result = await transaction_service.bulk_set_capital_improvement(ctx, [row.id], False)

        assert result == {"updated": 1, "skipped": 0}
        await service_db.refresh(row)
        assert row.is_capital_improvement is False
        assert row.placed_in_service_date is None

    @pytest.mark.asyncio
    async def test_skips_income(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        expense = await _row(service_db, test_org.id, test_user.id)
        income = await _row(service_db, test_org.id, test_user.id, "income")

        result = await transaction_service.bulk_set_capital_improvement(ctx, [expense.id, income.id], True)

        assert result == {"updated": 1, "skipped": 1}
        await service_db.refresh(income)
        assert income.is_capital_improvement is False

    @pytest.mark.asyncio
    async def test_leaves_another_organizations_rows_alone(
        self, service_db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        row = await _row(service_db, test_org.id, test_user.id)
        outsider = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role="owner")

        result = await transaction_service.bulk_set_capital_improvement(outsider, [row.id], True)

        assert result == {"updated": 0, "skipped": 1}
        await service_db.refresh(row)
        assert row.is_capital_improvement is False
