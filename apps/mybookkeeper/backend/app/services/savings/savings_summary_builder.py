"""Build the aggregated money summary the savings research sends to Claude. Pure; no I/O.

What leaves MBK is decided here, so every field is chosen, never passed
through: names, types and totals only. Account masks, policy and utility
account numbers, street addresses, transaction descriptions, payers and
tenants never reach the summary. Properties go as "Property 1", "Property 2"
(their names are usually their addresses), policy names are left out, and
account and plan names lose any run of 4+ digits. Personal transfers never reach it either:
the spending rows come from ``counted_transaction_filters``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterable, Sequence
from decimal import Decimal

from app.core.address_utils import location_without_street
from app.core.savings_constants import SUMMARY_TOP_CATEGORIES
from app.core.text_redaction import without_long_numbers
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.properties.property import Property
from app.models.properties.utility_plan import UtilityPlan
from app.models.savings.savings_idea import SavingsIdea
from app.repositories.savings.savings_spending_repo import CategorySpendRow, MerchantChargeRow
from app.schemas.budgets.budget_month_response import BudgetMonthResponse
from app.schemas.mortgage.mortgage_rate_watch_response import MortgageRateWatchResponse
from app.schemas.savings.savings_account_summary import SavingsAccountSummary
from app.schemas.savings.savings_budget_line import SavingsBudgetLine
from app.schemas.savings.savings_category_spend import SavingsCategorySpend
from app.schemas.savings.savings_insurance_summary import SavingsInsuranceSummary
from app.schemas.savings.savings_known_idea import SavingsKnownIdea
from app.schemas.savings.savings_mortgage_summary import SavingsMortgageSummary
from app.schemas.savings.savings_property_summary import SavingsPropertySummary
from app.schemas.savings.savings_research_summary import SavingsResearchSummary
from app.schemas.savings.savings_utility_summary import SavingsUtilitySummary
from app.services.insurance.premium_math import annual_premium_cents
from app.services.savings.recurring_charge_detector import detect_recurring_charges

_CENTS_PER_DOLLAR = 100
_UNKNOWN_PROPERTY = "Unknown property"
_PROPERTY_LABEL = "Property {number}"


def _dollars(cents: int | None) -> int | None:
    return None if cents is None else round(cents / _CENTS_PER_DOLLAR)


def _dollars_float(cents: int | None) -> float | None:
    return None if cents is None else round(cents / _CENTS_PER_DOLLAR, 2)


def _categories(rows: Iterable[CategorySpendRow]) -> list[SavingsCategorySpend]:
    spends = [
        SavingsCategorySpend(scope=scope, category=name, total_dollars=round(total), charges=count)
        for scope, name, total, count in rows
    ]
    spends.sort(key=lambda spend: spend.total_dollars, reverse=True)
    return spends[:SUMMARY_TOP_CATEGORIES]


def _accounts(accounts: Iterable[FinancialAccount]) -> list[SavingsAccountSummary]:
    return [
        SavingsAccountSummary(
            name=without_long_numbers(account.name) or account.account_type,
            institution=account.institution_name,
            account_type=account.account_type,
            is_closed=account.closed_on is not None,
        )
        for account in accounts
    ]


def _stable_order(properties: Iterable[Property]) -> list[Property]:
    """By id, so "Property 1" is the same property on every run (the database returns them unordered)."""
    return sorted(properties, key=lambda prop: str(prop.id))


def _property_labels(properties: Sequence[Property]) -> dict[uuid.UUID, str]:
    return {prop.id: _PROPERTY_LABEL.format(number=n) for n, prop in enumerate(properties, start=1)}


def _properties(properties: Iterable[Property], labels: dict[uuid.UUID, str]) -> list[SavingsPropertySummary]:
    return [
        SavingsPropertySummary(
            label=labels[prop.id],
            classification=prop.classification.value,
            location=location_without_street(prop.address),
            estimated_value_dollars=_dollars(prop.estimated_value_cents),
        )
        for prop in properties
    ]


def _mortgages(
    rate_watch: MortgageRateWatchResponse | None, labels: dict[uuid.UUID, str],
) -> list[SavingsMortgageSummary]:
    if rate_watch is None:
        return []
    return [
        SavingsMortgageSummary(
            property=labels.get(outlook.property_id, _UNKNOWN_PROPERTY),
            lender=outlook.lender,
            rate_type=outlook.rate_type,
            rate_pct=outlook.current_rate_pct,
            balance_dollars=_dollars(outlook.current_balance_cents),
            refi_verdict=outlook.verdict,
            survey_rate_pct=outlook.survey_rate_pct,
            refi_monthly_saving_low_dollars=_dollars(outlook.monthly_saving_low_cents),
            refi_monthly_saving_high_dollars=_dollars(outlook.monthly_saving_high_cents),
            refi_breakeven_low_months=outlook.breakeven_low_months,
            refi_breakeven_high_months=outlook.breakeven_high_months,
        )
        for outlook in rate_watch.outlooks
    ]


def _insurance(
    policies: Iterable[InsurancePolicy], names: dict[uuid.UUID, str],
) -> list[SavingsInsuranceSummary]:
    return [
        SavingsInsuranceSummary(
            property=names.get(policy.property_id, _UNKNOWN_PROPERTY),
            carrier=policy.carrier,
            yearly_premium_dollars=_dollars(
                annual_premium_cents(policy.premium_cents, policy.premium_frequency),
            ),
            deductible_dollars=_dollars(policy.deductible_cents),
            coverage_dollars=_dollars(policy.coverage_amount_cents),
            renews_on=policy.expiration_date,
        )
        for policy in policies
    ]


def _utilities(plans: Iterable[UtilityPlan], names: dict[uuid.UUID, str]) -> list[SavingsUtilitySummary]:
    return [
        SavingsUtilitySummary(
            property=names.get(plan.property_id, _UNKNOWN_PROPERTY),
            service_type=plan.service_type,
            provider=plan.provider_name,
            plan_name=without_long_numbers(plan.plan_name),
            rate_type=plan.rate_type,
            cents_per_kwh_at_1000=plan.avg_price_cents_per_kwh_at_1000,
            monthly_base_charge_dollars=_dollars_float(plan.monthly_base_charge_cents),
            monthly_cost_after_promo_dollars=_dollars_float(plan.post_promo_monthly_cents),
            term_end_date=plan.term_end_date,
            early_termination_fee_dollars=_dollars(plan.early_termination_fee_cents),
            download_mbps=plan.download_mbps,
        )
        for plan in plans
    ]


def _budget(month: BudgetMonthResponse | None) -> list[SavingsBudgetLine]:
    if month is None:
        return []
    return [
        SavingsBudgetLine(
            category=line.name,
            monthly_budget_dollars=_dollars(line.budget_cents),
            spent_this_month_dollars=_dollars(line.spent_cents) or 0,
        )
        for line in month.lines
        if not line.is_archived and (line.budget_cents is not None or line.spent_cents)
    ]


def _known(ideas: Iterable[SavingsIdea]) -> list[SavingsKnownIdea]:
    return [
        SavingsKnownIdea(category=idea.category, subject=idea.subject, title=idea.title, status=idea.status)
        for idea in ideas
    ]


def build_summary(
    *,
    as_of: _dt.date,
    window_start: _dt.date,
    category_rows: Sequence[CategorySpendRow],
    merchant_rows: Sequence[MerchantChargeRow],
    accounts: Iterable[FinancialAccount],
    properties: Sequence[Property],
    rate_watch: MortgageRateWatchResponse | None,
    insurance_policies: Iterable[InsurancePolicy],
    utility_plans: Iterable[UtilityPlan],
    budget: BudgetMonthResponse | None,
    known_ideas: Iterable[SavingsIdea],
) -> SavingsResearchSummary:
    ordered = _stable_order(properties)
    labels = _property_labels(ordered)
    yearly_total = sum((total for _, _, total, _ in category_rows), Decimal("0"))
    return SavingsResearchSummary(
        as_of=as_of,
        window_start=window_start,
        yearly_spending_dollars=round(yearly_total),
        spending_by_category=_categories(category_rows),
        recurring_charges=detect_recurring_charges(merchant_rows, as_of=as_of),
        accounts=_accounts(accounts),
        properties=_properties(ordered, labels),
        mortgages=_mortgages(rate_watch, labels),
        insurance_policies=_insurance(insurance_policies, labels),
        utility_plans=_utilities(utility_plans, labels),
        budget=_budget(budget),
        known_ideas=_known(known_ideas),
    )
