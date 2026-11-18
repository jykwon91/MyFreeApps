"""Marking an expense as a capital improvement, against the real table constraint."""
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
from app.services.transactions.capital_improvement import placed_in_service_date_for

PAID_ON = date(2025, 1, 27)


async def _expense(db: AsyncSession, org: Organization, user: User) -> Transaction:
    txn = Transaction(
        organization_id=org.id,
        user_id=user.id,
        transaction_date=PAID_ON,
        tax_year=2025,
        vendor="A to Z Services",
        amount=Decimal("8501.93"),
        transaction_type="expense",
        category="contract_work",
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

    with patch("app.services.transactions.transaction_service.unit_of_work", _fake):
        yield db


class TestPlacedInServiceDateFor:
    def test_defaults_to_the_day_it_was_paid(self) -> None:
        assert placed_in_service_date_for(True, None, PAID_ON) == PAID_ON

    def test_keeps_a_date_already_chosen(self) -> None:
        chosen = date(2025, 4, 1)
        assert placed_in_service_date_for(True, chosen, PAID_ON) == chosen

    def test_an_ordinary_expense_has_none(self) -> None:
        assert placed_in_service_date_for(False, date(2025, 4, 1), PAID_ON) is None


class TestMarkingAnExpense:
    @pytest.mark.asyncio
    async def test_saves_and_uses_the_payment_date(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        txn = await _expense(service_db, test_org, test_user)
        await transaction_service.update_transaction(ctx, txn.id, {"is_capital_improvement": True})
        await service_db.commit()
        await service_db.refresh(txn)
        assert txn.is_capital_improvement is True
        assert txn.placed_in_service_date == PAID_ON

    @pytest.mark.asyncio
    async def test_keeps_a_date_sent_with_it(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        txn = await _expense(service_db, test_org, test_user)
        chosen = date(2025, 4, 1)
        await transaction_service.update_transaction(
            ctx, txn.id, {"is_capital_improvement": True, "placed_in_service_date": chosen},
        )
        await service_db.commit()
        await service_db.refresh(txn)
        assert txn.placed_in_service_date == chosen

    @pytest.mark.asyncio
    async def test_unmarking_clears_the_date(
        self, service_db: AsyncSession, ctx: RequestContext, test_org: Organization, test_user: User,
    ) -> None:
        txn = await _expense(service_db, test_org, test_user)
        await transaction_service.update_transaction(ctx, txn.id, {"is_capital_improvement": True})
        await service_db.commit()
        await transaction_service.update_transaction(ctx, txn.id, {"is_capital_improvement": False})
        await service_db.commit()
        await service_db.refresh(txn)
        assert txn.is_capital_improvement is False
        assert txn.placed_in_service_date is None

    @pytest.mark.asyncio
    async def test_adding_one_by_api_saves_too(
        self, service_db: AsyncSession, ctx: RequestContext,
    ) -> None:
        created = await transaction_service.create_manual_transaction(ctx, {
            "transaction_date": PAID_ON,
            "amount": Decimal("500.00"),
            "transaction_type": "expense",
            "category": "contract_work",
            "is_capital_improvement": True,
        })
        await service_db.commit()
        assert created.placed_in_service_date == PAID_ON
