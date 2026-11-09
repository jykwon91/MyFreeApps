import uuid
from datetime import date

from pydantic import BaseModel


class TransactionFilters(BaseModel):
    """The one definition of how transactions are narrowed: the list and both exports read it."""

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
