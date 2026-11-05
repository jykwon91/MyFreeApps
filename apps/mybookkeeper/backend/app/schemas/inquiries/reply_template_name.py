"""A reply template's name, matching ``reply_templates.name`` String(100)."""
from typing import Annotated

from pydantic import StringConstraints

REPLY_TEMPLATE_NAME_MAX_LENGTH = 100

# Trimmed, so " Welcome" and "Welcome" can't sit side by side as two names.
ReplyTemplateName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=REPLY_TEMPLATE_NAME_MAX_LENGTH),
]
