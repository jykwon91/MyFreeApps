from pydantic import Field

from app.core.transaction_list_constants import DEFAULT_TRANSACTION_PAGE_SIZE, MAX_TRANSACTION_PAGE_SIZE
from app.schemas.transactions.transaction_filters import TransactionFilters


class TransactionPageQuery(TransactionFilters):
    """GET /transactions/page's query string: the filters and order, plus which page.

    One model for the whole query string because FastAPI reads a query-parameter model's
    fields as separate params only when the model is the route's sole query parameter.
    """

    limit: int = Field(default=DEFAULT_TRANSACTION_PAGE_SIZE, ge=1, le=MAX_TRANSACTION_PAGE_SIZE)
    offset: int = Field(default=0, ge=0)
