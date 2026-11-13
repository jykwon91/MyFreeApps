"""A pizza line's free-form modification request, trimmed. Blank collapses to an empty string."""
from typing import Annotated

from pydantic import StringConstraints

MODIFICATIONS_TEXT_MAX_LENGTH = 500

ModificationsText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=MODIFICATIONS_TEXT_MAX_LENGTH),
]
