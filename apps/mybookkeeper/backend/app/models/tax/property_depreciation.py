import uuid
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class PropertyDepreciation:
    """One property's depreciation for a tax year, as its computed Form 4562 states it."""

    form_instance_id: uuid.UUID
    amount: Decimal
