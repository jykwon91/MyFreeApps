"""TransactionFilterArgs mirrors every filter field of TransactionFilters, so a new filter can't be dropped silently."""
from app.repositories.transactions.transaction_filter_args import TransactionFilterArgs
from app.schemas.transactions.transaction_filters import TransactionFilters

_SORT_FIELDS = {"sort_by", "sort_dir", "sort"}


def test_filter_args_cover_every_filter_field() -> None:
    assert set(TransactionFilters.model_fields) - _SORT_FIELDS == set(TransactionFilterArgs.__annotations__)
