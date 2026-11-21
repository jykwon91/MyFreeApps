"""What the Sync Sessions panel says about an email whose Claude read failed."""
from app.models.extraction.extraction_failure import ExtractionFailure
from app.services.email.constants import (
    EMAIL_EXTRACTION_FAILED_SUFFIX,
    EMAIL_EXTRACTION_FAILURE_MESSAGES,
    EMAIL_EXTRACTION_GAVE_UP_SUFFIX,
    EMAIL_EXTRACTION_NO_RETRY_HINT_KINDS,
    EMAIL_EXTRACTION_WILL_RETRY_SUFFIX,
)


def failure_reason(failure: ExtractionFailure, *, attempts: int, will_retry: bool) -> str:
    """A plain reason plus what happens next. Never the raw exception text."""
    reason = EMAIL_EXTRACTION_FAILURE_MESSAGES[failure.kind]
    if will_retry:
        return reason + EMAIL_EXTRACTION_WILL_RETRY_SUFFIX
    if failure.retryable:
        return reason + EMAIL_EXTRACTION_GAVE_UP_SUFFIX.format(attempts=attempts)
    if failure.kind in EMAIL_EXTRACTION_NO_RETRY_HINT_KINDS:
        return reason
    return reason + EMAIL_EXTRACTION_FAILED_SUFFIX
