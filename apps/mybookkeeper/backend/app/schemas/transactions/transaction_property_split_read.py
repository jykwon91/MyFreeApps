import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class TransactionPropertySplitRead(BaseModel):
    """One property's share of a split transaction. ``property_id`` is null once that property is deleted."""

    model_config = ConfigDict(from_attributes=True)

    property_id: uuid.UUID | None
    amount: Decimal
