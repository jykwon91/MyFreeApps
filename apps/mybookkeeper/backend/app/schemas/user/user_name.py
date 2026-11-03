"""Validated user name, matching the nullable ``users.name`` String(255) column."""
from typing import Annotated

from platform_shared.schemas.display_name import NO_NUL_PATTERN
from pydantic import AfterValidator, StringConstraints


def _blank_to_none(value: str | None) -> str | None:
    return value or None


# Blank names become null, the same as the forms send, so display fallbacks apply.
UserName = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=255, pattern=NO_NUL_PATTERN)] | None,
    AfterValidator(_blank_to_none),
]
