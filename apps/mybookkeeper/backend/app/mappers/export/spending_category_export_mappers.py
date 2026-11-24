"""Account data export mapper: spending categories."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
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

SPENDING_CATEGORY_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    SPENDING_CATEGORIES_EXPORT,
)
