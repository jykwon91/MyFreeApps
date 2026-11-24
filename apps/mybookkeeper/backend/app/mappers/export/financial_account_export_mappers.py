"""Account data export mappers: financial accounts (bank, card, loan, investment)."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.financial_accounts.financial_account import FinancialAccount

FINANCIAL_ACCOUNTS_EXPORT: Final = TableExportMapper(
    FinancialAccount,
    (
        "id",
        "organization_id",
        "user_id",
        "name",
        "institution_name",
        "account_type",
        "mask",
        "currency",
        "current_balance_cents",
        "balance_as_of",
        "closed_on",
        "mortgage_id",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

FINANCIAL_ACCOUNT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    FINANCIAL_ACCOUNTS_EXPORT,
)
