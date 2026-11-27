"""Where money in came from over the range. Salary, rent, one-offs and other
add up to total income."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesIncomeSplitResponse(BaseModel):
    # Pay from a payroll company or a W-2 employer.
    salary_cents: int
    # Rent and other rental money in, before the rentals' costs.
    rental_cents: int
    # The rentals' costs other than mortgage and loan payments (in expenses).
    rental_costs_cents: int
    # Rent less those costs: what the rentals netted. Below zero when they
    # cost more than they brought in.
    rental_net_cents: int
    one_off_cents: int
    other_cents: int
