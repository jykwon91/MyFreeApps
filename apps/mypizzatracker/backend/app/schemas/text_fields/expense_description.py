"""An optional expense description, trimmed. Blank collapses to an empty string."""
from typing import Annotated

from pydantic import StringConstraints

EXPENSE_DESCRIPTION_MAX_LENGTH = 500

ExpenseDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=EXPENSE_DESCRIPTION_MAX_LENGTH),
]
