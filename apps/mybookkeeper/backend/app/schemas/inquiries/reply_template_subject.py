"""A reply template's subject line, matching ``reply_templates.subject_template`` String(500)."""
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from app.schemas.inquiries.one_line import require_one_line

REPLY_TEMPLATE_SUBJECT_MAX_LENGTH = 500


ReplyTemplateSubject = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=REPLY_TEMPLATE_SUBJECT_MAX_LENGTH),
    AfterValidator(require_one_line),
]
