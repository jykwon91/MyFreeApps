"""How the transactions list may be ordered. The api-client's TransactionSortField mirrors these."""
from typing import Literal, get_args

TransactionSortField = Literal[
    "transaction_date", "amount", "vendor", "category", "status", "transaction_type",
    # The property's name (not its id), and whether the row counts towards the tax report.
    "property_id", "tax_relevant",
]
SortDirection = Literal["asc", "desc"]

# Newest first: the order the list had before it could be chosen.
DEFAULT_TRANSACTION_SORT_FIELD: TransactionSortField = "transaction_date"
DEFAULT_SORT_DIRECTION: SortDirection = "desc"

# A multi-column order is sent as repeated ``sort=column:direction`` params, at most one per column.
SORT_KEY_SEPARATOR = ":"
MAX_SORT_KEYS = len(get_args(TransactionSortField))
