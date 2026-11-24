"""Account data export mappers: financial accounts (bank, card, loan, investment),
the bank connections that sync them, the daily net worth snapshots, and the
securities and holdings of investment accounts."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.investments.holding import Holding
from app.models.investments.security import Security
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
        "investments_status",
        "investments_error_code",
        "holdings_synced_at",
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

SECURITIES_EXPORT: Final = TableExportMapper(
    Security,
    (
        "id",
        "organization_id",
        "user_id",
        "plaid_security_id",
        "ticker_symbol",
        "name",
        "security_type",
        "cusip",
        "isin",
        "is_cash_equivalent",
        "close_price",
        "close_price_as_of",
        "currency",
        "created_at",
        "updated_at",
    ),
)

HOLDINGS_EXPORT: Final = TableExportMapper(
    Holding,
    (
        "id",
        "organization_id",
        "user_id",
        "financial_account_id",
        "security_id",
        "quantity",
        "cost_basis_cents",
        "institution_price",
        "institution_price_as_of",
        "institution_value_cents",
        "currency",
        "created_at",
        "updated_at",
    ),
)

FINANCIAL_ACCOUNT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    FINANCIAL_ACCOUNTS_EXPORT,
    PLAID_ITEMS_EXPORT,
    BALANCE_SNAPSHOTS_EXPORT,
    SECURITIES_EXPORT,
    HOLDINGS_EXPORT,
)
