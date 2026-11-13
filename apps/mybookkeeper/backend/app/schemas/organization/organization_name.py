"""An organization's name, matching ``organizations.name`` String(255)."""
from typing import Annotated

from pydantic import StringConstraints

ORGANIZATION_NAME_MAX_LENGTH = 255

# Trimmed, so a blank name is refused and the stored one has no stray spaces.
OrganizationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=ORGANIZATION_NAME_MAX_LENGTH),
]
