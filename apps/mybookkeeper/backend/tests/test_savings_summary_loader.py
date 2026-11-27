"""The savings summary loader against a real (SQLite) database.

Pinned: it reads this person's own accounts and this workspace's spending
over the last year, keeps one current plan per utility, lists earlier ideas
for subject reuse, and hands the rate watch and budget through.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.properties.property import Property
from app.models.properties.utility_plan import UtilityPlan
from app.models.savings.savings_idea import SavingsIdea
from app.models.transactions.transaction import Transaction
from app.schemas.mortgage.mortgage_rate_watch_response import MortgageRateWatchResponse
from app.services.savings import savings_summary_loader

pytestmark = pytest.mark.asyncio

_TODAY = _dt.date(2026, 11, 27)
_NOW = _dt.datetime(2026, 11, 27, tzinfo=_dt.timezone.utc)


async def test_the_loader_gathers_this_persons_picture(db: AsyncSession) -> None:
    org, user = uuid.uuid4(), uuid.uuid4()
    prop = Property(id=uuid.uuid4(), organization_id=org, user_id=user, name="Elm", address="1 Elm, Austin, TX")
    db.add(prop)
    db.add_all([
        FinancialAccount(organization_id=org, user_id=user, name="Sapphire", account_type="credit_card"),
        FinancialAccount(organization_id=org, user_id=uuid.uuid4(), name="Spouse card", account_type="credit_card"),
        UtilityPlan(organization_id=org, user_id=user, property_id=prop.id, service_type="electricity",
                    provider_name="Old Co", rate_type="fixed", service_start_date=_dt.date(2024, 1, 1)),
        UtilityPlan(organization_id=org, user_id=user, property_id=prop.id, service_type="electricity",
                    provider_name="New Co", rate_type="fixed", service_start_date=_dt.date(2026, 1, 1)),
        SavingsIdea(organization_id=org, user_id=user, idea_key="subscription:hulu", category="subscription",
                    subject="Hulu", title="Cancel Hulu", savings_low_cents=0, savings_high_cents=0, effort="low",
                    why_it_fits="x", status="dismissed", first_found_at=_NOW, last_confirmed_at=_NOW),
    ])
    for days in (5, 400):
        db.add(Transaction(
            id=uuid.uuid4(), organization_id=org, user_id=user, transaction_date=_TODAY - _dt.timedelta(days=days),
            tax_year=2026, amount=Decimal("90"), transaction_type="expense", category="utilities",
            status="approved", is_manual=True, vendor="Comcast",
        ))
    await db.commit()

    @asynccontextmanager
    async def _uow():
        yield db

    rate_watch = AsyncMock(return_value=MortgageRateWatchResponse())
    budget = AsyncMock(return_value=None)
    with (
        patch.object(savings_summary_loader, "unit_of_work", _uow),
        patch.object(savings_summary_loader.mortgage_rate_watch_service, "get_rate_watch", rate_watch),
        patch.object(savings_summary_loader.budget_service, "get_month", budget),
    ):
        summary = await savings_summary_loader.load_summary(organization_id=org, user_id=user, today=_TODAY)

    assert [a.name for a in summary.accounts] == ["Sapphire"]
    assert [p.provider for p in summary.utility_plans] == ["New Co"]
    assert summary.spending_by_category[0].total_dollars == 90
    assert [k.subject for k in summary.known_ideas] == ["Hulu"]
    assert (summary.properties[0].label, summary.properties[0].location) == ("Property 1", "Austin, TX")
    assert budget.await_args.kwargs["month"] == _dt.date(2026, 11, 1)
    assert rate_watch.await_args.kwargs["user_id"] == user
