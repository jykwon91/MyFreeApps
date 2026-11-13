"""A required human-typed name (drop, pizza, topping, customer), trimmed; blank is rejected."""
from typing import Annotated

from pydantic import StringConstraints

REQUIRED_NAME_MAX_LENGTH = 100

RequiredName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=REQUIRED_NAME_MAX_LENGTH),
]
