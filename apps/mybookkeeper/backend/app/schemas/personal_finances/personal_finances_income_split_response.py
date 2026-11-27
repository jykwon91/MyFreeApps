"""Where money in came from over the range. The three add up to total income."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesIncomeSplitResponse(BaseModel):
    # Paychecks (``SALARY_PAYEE_MARKERS``).
    salary_cents: int
    # Rent and other rental money in, less the rentals' costs other than
    # mortgage and loan payments (those stay in expenses, on their own line).
    rental_net_cents: int
    other_cents: int
