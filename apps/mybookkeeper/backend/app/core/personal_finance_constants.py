"""What the personal finances page sorts money in by, and what it flags."""
from __future__ import annotations

from typing import Final

# Payroll companies a paycheck arrives from. Matched case-insensitively
# anywhere in the payee name.
SALARY_PAYEE_MARKERS: Final[tuple[str, ...]] = ("paychex", "paycor")

# Money in other than pay or rent this large is a one-off (an inheritance,
# a deposit returned) when its payer paid nothing in any other month. It
# stays in the totals but is left out of the typical month.
ONE_OFF_MIN_CENTS: Final[int] = 250_000

# How money in is split on the page.
INCOME_KIND_SALARY: Final[str] = "salary"
INCOME_KIND_RENTAL: Final[str] = "rental"
INCOME_KIND_OTHER: Final[str] = "other"
