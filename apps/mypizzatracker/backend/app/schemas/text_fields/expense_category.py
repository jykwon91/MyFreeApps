"""An expense category, trimmed; blank is rejected."""
from typing import Annotated

from pydantic import StringConstraints

EXPENSE_CATEGORY_MAX_LENGTH = 60

ExpenseCategory = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=EXPENSE_CATEGORY_MAX_LENGTH),
]
