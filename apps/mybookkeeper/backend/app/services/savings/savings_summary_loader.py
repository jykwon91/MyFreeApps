"""Load everything one person's savings summary is built from, then build it."""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.savings_constants import SUMMARY_KNOWN_IDEAS_MAX, SUMMARY_LOOKBACK_DAYS
from app.db.session import unit_of_work
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.insurance import insurance_policy_repo
from app.repositories.properties import property_repo, utility_plan_repo
from app.repositories.savings import savings_idea_repo, savings_spending_repo
from app.schemas.savings.savings_research_summary import SavingsResearchSummary
from app.services.budgets import budget_service
from app.services.mortgage import mortgage_rate_watch_service
from app.services.properties._utility_plan_helpers import current_plan_ids
from app.services.savings.savings_summary_builder import build_summary


async def load_summary(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, today: _dt.date,
) -> SavingsResearchSummary:
    window_start = today - _dt.timedelta(days=SUMMARY_LOOKBACK_DAYS)
    async with unit_of_work() as db:
        category_rows = await savings_spending_repo.expense_totals_by_category(
            db, organization_id=organization_id, start=window_start, end=today,
        )
        merchant_rows = await savings_spending_repo.merchant_charges(
            db, organization_id=organization_id, start=window_start, end=today,
        )
        accounts = await financial_account_repo.list_for_user(
            db, user_id=user_id, organization_id=organization_id,
        )
        properties = await property_repo.list_active(db, organization_id)
        policies = await insurance_policy_repo.list_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        plans = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        known_ideas = await savings_idea_repo.list_recent(
            db, organization_id=organization_id, user_id=user_id, limit=SUMMARY_KNOWN_IDEAS_MAX,
        )
    current_ids = current_plan_ids(list(plans))
    rate_watch = await mortgage_rate_watch_service.get_rate_watch(
        user_id=user_id, organization_id=organization_id, today=today,
    )
    budget = await budget_service.get_month(organization_id=organization_id, month=today.replace(day=1))
    return build_summary(
        as_of=today,
        window_start=window_start,
        category_rows=category_rows,
        merchant_rows=merchant_rows,
        accounts=accounts,
        properties=properties,
        rate_watch=rate_watch,
        insurance_policies=policies,
        utility_plans=[plan for plan in plans if plan.id in current_ids],
        budget=budget,
        known_ideas=known_ideas,
    )
