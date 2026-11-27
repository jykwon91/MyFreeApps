"""Account data export mappers: spending categories, their budgets, and the
payees counted as a mortgage or a loan."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.budgets.spending_budget import SpendingBudget
from app.models.transactions.loan_payee import LoanPayee
from app.models.transactions.spending_category import SpendingCategory

SPENDING_CATEGORIES_EXPORT: Final = TableExportMapper(
    SpendingCategory,
    (
        "id",
        "organization_id",
        "name",
        "is_default",
        "archived_at",
        "created_at",
        "updated_at",
    ),
)

SPENDING_BUDGETS_EXPORT: Final = TableExportMapper(
    SpendingBudget,
    (
        "id",
        "organization_id",
        "spending_category_id",
        "effective_month",
        "amount_cents",
        "created_at",
        "updated_at",
    ),
)

LOAN_PAYEES_EXPORT: Final = TableExportMapper(
    LoanPayee,
    (
        "id",
        "organization_id",
        "created_by_user_id",
        "display_name",
        "normalized_payee",
        "kind",
        "created_at",
    ),
)

SPENDING_CATEGORY_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    SPENDING_CATEGORIES_EXPORT,
    SPENDING_BUDGETS_EXPORT,
    LOAN_PAYEES_EXPORT,
)
