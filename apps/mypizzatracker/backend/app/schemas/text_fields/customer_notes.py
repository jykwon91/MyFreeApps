"""Owner notes on a customer, trimmed. Blank collapses to an empty string (the service stores it as NULL)."""
from typing import Annotated

from pydantic import StringConstraints

CUSTOMER_NOTES_MAX_LENGTH = 2000

CustomerNotes = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=CUSTOMER_NOTES_MAX_LENGTH),
]
