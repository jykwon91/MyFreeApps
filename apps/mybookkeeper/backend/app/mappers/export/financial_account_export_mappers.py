"""Account data export mappers: financial accounts (bank, card, loan, investment),
the bank connections that sync them, and the daily net worth snapshots."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.net_worth.balance_snapshot import BalanceSnapshot

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
        "default_transaction_scope",
        "plaid_item_id",
        "plaid_account_id",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

PLAID_ITEMS_EXPORT: Final = TableExportMapper(
    PlaidItem,
    (
        "id",
        "organization_id",
        "user_id",
        "plaid_item_id",
        "institution_id",
        "institution_name",
        "status",
        "error_type",
        "error_code",
        "last_synced_at",
        "created_at",
        "updated_at",
    ),
)

BALANCE_SNAPSHOTS_EXPORT: Final = TableExportMapper(
    BalanceSnapshot,
    (
        "id",
        "organization_id",
        "user_id",
        "snapshot_date",
        "financial_account_id",
        "mortgage_id",
        "property_id",
        "balance_cents",
        "created_at",
        "updated_at",
    ),
)

FINANCIAL_ACCOUNT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    FINANCIAL_ACCOUNTS_EXPORT,
    PLAID_ITEMS_EXPORT,
    BALANCE_SNAPSHOTS_EXPORT,
)
