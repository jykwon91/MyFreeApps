"""Validated display name, matching the ``users.display_name`` column."""
from typing import Annotated

from pydantic import StringConstraints

DISPLAY_NAME_MAX_LENGTH = 100

# The column is NOT NULL String(100), and Postgres rejects NUL bytes in text.
DisplayName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=DISPLAY_NAME_MAX_LENGTH,
        pattern=r"^[^\x00]*$",
    ),
]
