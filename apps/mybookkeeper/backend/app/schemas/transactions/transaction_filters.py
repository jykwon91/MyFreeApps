import uuid
from datetime import date

from typing import Literal

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
    # Opt-in: only the categories the dashboard summary adds up as revenue or as expenses.
    summary_kind: Literal["revenue", "expenses"] | None = None
    # Opt-in: skip transactions of inactive properties, as the dashboard summary does.
    active_properties_only: bool = False
