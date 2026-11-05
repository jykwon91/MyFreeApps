import uuid
from decimal import Decimal
from typing import Protocol


class ScheduleERow(Protocol):
    property_id: uuid.UUID | None
    schedule_e_line: str | None
    total_amount: Decimal
