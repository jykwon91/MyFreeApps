"""A reply template's subject line, matching ``reply_templates.subject_template`` String(500)."""
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

REPLY_TEMPLATE_SUBJECT_MAX_LENGTH = 500


def _one_line(value: str) -> str:
    # It becomes an email Subject header, which can't hold a line break.
    if "\r" in value or "\n" in value:
        raise ValueError("The subject must be one line")
    return value


ReplyTemplateSubject = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=REPLY_TEMPLATE_SUBJECT_MAX_LENGTH),
    AfterValidator(_one_line),
]
