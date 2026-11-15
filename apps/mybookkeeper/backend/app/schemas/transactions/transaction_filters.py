import uuid
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.property_constants import UnassignedPropertyId
from app.core.transaction_sort_constants import (
    DEFAULT_SORT_DIRECTION,
    DEFAULT_TRANSACTION_SORT_FIELD,
    MAX_SORT_KEYS,
    SortDirection,
    TransactionSortField,
)
from app.schemas.transactions.transaction import TransactionCategory, TransactionStatus, TransactionType
from app.schemas.transactions.transaction_sort_key import TransactionSortKey, parse_sort_key


class TransactionFilters(BaseModel):
    """The one definition of how transactions are narrowed and ordered: the list and both exports read it.

    Routes take it as a query-parameter model (``Annotated[TransactionFilters, Query()]``), which is
    what lets the list fields repeat in the query string (``statuses=a&statuses=b``).
    """

    property_id: uuid.UUID | None = None
    unassigned: bool = False
    applicant_id: uuid.UUID | None = None
    status: str | None = None
    to_review: bool = False
    transaction_type: str | None = None
    category: str | None = None
    vendor: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    tax_year: int | None = None
    # Whether the row counts towards the tax report; None leaves both in.
    tax_relevant: bool | None = None
    # Opt-in: only the categories the dashboard summary adds up as revenue or as expenses.
    summary_kind: Literal["revenue", "expenses"] | None = None
    # Opt-in: skip transactions of inactive properties, as the dashboard summary does.
    active_properties_only: bool = False
    # Any-of filters (the web table's column filters). Each narrows on top of the single-value
    # filter of the same column; an empty list leaves the column alone. property_ids takes
    # "unassigned" for rows with no property.
    statuses: list[TransactionStatus] = []
    transaction_types: list[TransactionType] = []
    categories: list[TransactionCategory] = []
    property_ids: list[uuid.UUID | UnassignedPropertyId] = []
    sort_by: TransactionSortField = DEFAULT_TRANSACTION_SORT_FIELD
    sort_dir: SortDirection = DEFAULT_SORT_DIRECTION
    # A multi-column order (the web table's shift-click), most significant first, as
    # "column:direction". When given it replaces sort_by/sort_dir, which the phone sends.
    sort: list[str] = Field(default=[], max_length=MAX_SORT_KEYS)

    @field_validator("sort")
    @classmethod
    def _check_sort(cls, value: list[str]) -> list[str]:
        fields = [parse_sort_key(raw).field for raw in value]
        if len(set(fields)) != len(fields):
            raise ValueError("each column can be sorted by only once")
        return value

    def sort_keys(self) -> list[TransactionSortKey]:
        """The order, most significant key first."""
        if self.sort:
            return [parse_sort_key(raw) for raw in self.sort]
        return [TransactionSortKey(self.sort_by, self.sort_dir)]

    def filter_args(self) -> dict[str, Any]:
        """The filters alone (no order, nor a subclass's paging fields), as the repository's keyword arguments."""
        return self.model_dump(include=_FILTER_FIELDS)


_ORDER_FIELDS = frozenset({"sort_by", "sort_dir", "sort"})
_FILTER_FIELDS = frozenset(TransactionFilters.model_fields) - _ORDER_FIELDS
