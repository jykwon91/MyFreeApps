"""Account data export mappers: spending categories and their budgets."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.budgets.spending_budget import SpendingBudget
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

SPENDING_CATEGORY_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    SPENDING_CATEGORIES_EXPORT,
    SPENDING_BUDGETS_EXPORT,
)
