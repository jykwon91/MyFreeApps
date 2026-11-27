"""The compact, aggregated money picture the savings research job sends to Claude.

Built by ``services/savings/savings_summary_builder.py``. Aggregates and names
only: no account numbers, policy numbers, tenant names, transaction
descriptions or personal transfers.
"""
import datetime as _dt

from pydantic import BaseModel

from app.schemas.savings.savings_account_summary import SavingsAccountSummary
from app.schemas.savings.savings_budget_line import SavingsBudgetLine
from app.schemas.savings.savings_category_spend import SavingsCategorySpend
from app.schemas.savings.savings_insurance_summary import SavingsInsuranceSummary
from app.schemas.savings.savings_known_idea import SavingsKnownIdea
from app.schemas.savings.savings_mortgage_summary import SavingsMortgageSummary
from app.schemas.savings.savings_property_summary import SavingsPropertySummary
from app.schemas.savings.savings_recurring_charge import SavingsRecurringCharge
from app.schemas.savings.savings_utility_summary import SavingsUtilitySummary


class SavingsResearchSummary(BaseModel):
    as_of: _dt.date
    window_start: _dt.date
    yearly_spending_dollars: int
    spending_by_category: list[SavingsCategorySpend]
    recurring_charges: list[SavingsRecurringCharge]
    accounts: list[SavingsAccountSummary]
    properties: list[SavingsPropertySummary]
    mortgages: list[SavingsMortgageSummary]
    insurance_policies: list[SavingsInsuranceSummary]
    utility_plans: list[SavingsUtilitySummary]
    budget: list[SavingsBudgetLine]
    known_ideas: list[SavingsKnownIdea]
