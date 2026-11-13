"""A customer phone as typed, trimmed; blank is rejected. The service normalises it to digits."""
from typing import Annotated

from pydantic import StringConstraints

CUSTOMER_PHONE_MAX_LENGTH = 20

CustomerPhone = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=CUSTOMER_PHONE_MAX_LENGTH),
]
