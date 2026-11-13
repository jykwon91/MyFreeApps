"""An expense vendor, trimmed; blank is rejected."""
from typing import Annotated

from pydantic import StringConstraints

EXPENSE_VENDOR_MAX_LENGTH = 100

ExpenseVendor = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=EXPENSE_VENDOR_MAX_LENGTH),
]
