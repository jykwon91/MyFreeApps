"""One key of the list's order: a column and a direction, written ``column:direction`` in the query string."""
from typing import NamedTuple, get_args

from app.core.transaction_sort_constants import SORT_KEY_SEPARATOR, SortDirection, TransactionSortField


class TransactionSortKey(NamedTuple):
    field: TransactionSortField
    direction: SortDirection


def parse_sort_key(raw: str) -> TransactionSortKey:
    """``"amount:desc"`` → TransactionSortKey("amount", "desc"). Raises ValueError for any column or direction outside the allowlist."""
    field, _, direction = raw.partition(SORT_KEY_SEPARATOR)
    if field not in get_args(TransactionSortField) or direction not in get_args(SortDirection):
        raise ValueError(f"unknown sort key {raw!r}")
    return TransactionSortKey(field, direction)  # type: ignore[arg-type]  # narrowed by the allowlist check
