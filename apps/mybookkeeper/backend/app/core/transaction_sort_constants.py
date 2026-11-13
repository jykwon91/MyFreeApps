"""How the transactions list may be ordered. The api-client's TransactionSortField mirrors these."""
from typing import Literal

TransactionSortField = Literal["transaction_date", "amount", "vendor", "category", "status", "transaction_type"]
SortDirection = Literal["asc", "desc"]

# Newest first: the order the list had before it could be chosen.
DEFAULT_TRANSACTION_SORT_FIELD: TransactionSortField = "transaction_date"
DEFAULT_SORT_DIRECTION: SortDirection = "desc"
