"""A personal spending category's monthly budget against this month's spending."""
from pydantic import BaseModel


class SavingsBudgetLine(BaseModel):
    category: str
    monthly_budget_dollars: int | None
    spent_this_month_dollars: int
