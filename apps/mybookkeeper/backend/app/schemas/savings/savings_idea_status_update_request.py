"""Mark an idea done or dismissed, or put it back on the list."""
from typing import Literal

from pydantic import BaseModel


class SavingsIdeaStatusUpdateRequest(BaseModel):
    # Mirrors ``IDEA_STATUSES`` in ``app/core/savings_enums.py``.
    status: Literal["open", "done", "dismissed"]
