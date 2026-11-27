import uuid
from decimal import Decimal

from pydantic import BaseModel


class TransactionPropertyShare(BaseModel):
    """One property and the part of the transaction's amount that is its own."""

    property_id: uuid.UUID
    amount: Decimal
