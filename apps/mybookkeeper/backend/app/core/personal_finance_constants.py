"""What the personal finances page sorts money in by, and what it flags."""
from __future__ import annotations

from typing import Final

# Payroll companies a paycheck arrives from, and the word banks print on one.
# Matched as whole words in the payee name.
PAYROLL_WORDS: Final[frozenset[str]] = frozenset({"paychex", "paycor", "adp", "gusto", "payroll"})

# The tax form whose issuer is an employer: money in from a W-2 issuer is pay.
EMPLOYER_FORM: Final[str] = "w2"

# Words left out when an employer's name is matched against a payee, so
# "OneOncology, LLC" on the W-2 matches "ONEONCOLOGY LLC AP PAY" and also
# "ONEONCOLOGY AP PAY".
EMPLOYER_NAME_FILLER_WORDS: Final[frozenset[str]] = frozenset({
    "llc", "inc", "corp", "corporation", "co", "company", "ltd", "lp", "llp", "pc", "pllc", "the", "of", "and",
})

# Money in other than pay or rent this large is a one-off (an inheritance,
# a deposit returned) when its payer paid nothing in any other month. It
# stays in the totals but is left out of the typical month.
ONE_OFF_MIN_CENTS: Final[int] = 250_000

# How money in is split on the page.
INCOME_KIND_SALARY: Final[str] = "salary"
INCOME_KIND_RENTAL: Final[str] = "rental"
INCOME_KIND_ONE_OFF: Final[str] = "one_off"
INCOME_KIND_OTHER: Final[str] = "other"
