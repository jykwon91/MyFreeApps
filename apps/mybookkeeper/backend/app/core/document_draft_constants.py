"""Answers for a record read (utility plan, mortgage, insurance) whose reply failed.

Returned as the 422 detail by the extract endpoints, so the form says what
happened instead of opening empty.
"""

DRAFT_READ_UNREADABLE_DETAIL = "I couldn't make sense of what I read in this document. Try again."
DRAFT_READ_CUT_OFF_DETAIL = (
    "This document had more in it than I could read in one go. "
    "Try again, or upload just the page with the terms."
)
