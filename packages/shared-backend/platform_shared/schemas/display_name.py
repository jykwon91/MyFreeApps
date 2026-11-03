"""Validated display name, matching the ``users.display_name`` column."""
from typing import Annotated

from pydantic import StringConstraints

DISPLAY_NAME_MAX_LENGTH = 100

# Postgres rejects NUL bytes in text columns.
NO_NUL_PATTERN = r"^[^\x00]*$"

# The column is NOT NULL String(100).
DisplayName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=DISPLAY_NAME_MAX_LENGTH,
        pattern=NO_NUL_PATTERN,
    ),
]
