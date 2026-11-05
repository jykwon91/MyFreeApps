"""A reply template's message, matching ``reply_templates.body_template`` Text."""
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

REPLY_TEMPLATE_BODY_MAX_LENGTH = 10000


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("The message can't be blank")
    return value


# Kept as written, line breaks included: only a message of nothing but spaces is refused.
ReplyTemplateBody = Annotated[
    str,
    StringConstraints(min_length=1, max_length=REPLY_TEMPLATE_BODY_MAX_LENGTH),
    AfterValidator(_not_blank),
]
