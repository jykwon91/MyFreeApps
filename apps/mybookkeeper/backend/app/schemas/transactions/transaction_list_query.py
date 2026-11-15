from pydantic import Field

from app.core.transaction_list_constants import DEFAULT_TRANSACTION_LIST_LIMIT, MAX_TRANSACTION_LIST_LIMIT
from app.schemas.transactions.transaction_filters import TransactionFilters


class TransactionListQuery(TransactionFilters):
    """GET /transactions' query string: the filters and order, plus the batch it returns.

    One model for the whole query string because FastAPI reads a query-parameter model's
    fields as separate params only when the model is the route's sole query parameter.
    """

    limit: int = Field(default=DEFAULT_TRANSACTION_LIST_LIMIT, le=MAX_TRANSACTION_LIST_LIMIT)
    offset: int = 0
