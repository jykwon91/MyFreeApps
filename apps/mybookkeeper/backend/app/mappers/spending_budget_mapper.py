"""SpendingBudget row -> response schema."""
from app.core.month_text import format_month
from app.models.budgets.spending_budget import SpendingBudget
from app.schemas.budgets.spending_budget_response import SpendingBudgetResponse


def to_response(budget: SpendingBudget) -> SpendingBudgetResponse:
    return SpendingBudgetResponse(
        spending_category_id=budget.spending_category_id,
        effective_month=format_month(budget.effective_month),
        amount_cents=budget.amount_cents,
    )
