"""The filters the transaction list and its count both take, as keyword arguments. Mirrors TransactionFilters minus the order."""
import uuid
from datetime import date
from typing import Literal, TypedDict

from app.core.property_constants import UnassignedPropertyId


class TransactionFilterArgs(TypedDict, total=False):
    property_id: uuid.UUID | None
    unassigned: bool
    applicant_id: uuid.UUID | None
    status: str | None
    to_review: bool
    transaction_type: str | None
    category: str | None
    vendor: str | None
    start_date: date | None
    end_date: date | None
    tax_year: int | None
    tax_relevant: bool | None
    summary_kind: Literal["revenue", "expenses"] | None
    active_properties_only: bool
    statuses: list[str]
    transaction_types: list[str]
    categories: list[str]
    property_ids: list[uuid.UUID | UnassignedPropertyId]
