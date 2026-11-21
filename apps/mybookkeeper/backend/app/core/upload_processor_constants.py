"""Tunables for the upload processor worker (``app/workers/upload_processor_worker.py``).

Imports no settings: ``app/workers/upload_processor_healthcheck.py`` reads
these and must not be able to fail for reasons unrelated to the worker.
"""
import tempfile
from pathlib import Path
from typing import Final

from app.models.extraction.extraction_failure_kind import ExtractionFailureKind

POLL_INTERVAL_SECONDS: Final = 2
MAX_CONCURRENT_USERS: Final = 5
MAX_RETRIES: Final = 3

# Shown on a document whose Claude read failed. A retryable failure is retried
# (up to MAX_RETRIES) and its message stays if it ends up failed; a cut-off
# reply is never retried (the same document is cut off the same way). Details (the
# exception, Anthropic's error type) go to the log and the admin health event.
UPLOAD_FAILURE_MESSAGES: Final[dict[ExtractionFailureKind, str]] = {
    ExtractionFailureKind.BUSY: "The AI service is busy right now. Try re-extracting this document in a few minutes.",
    ExtractionFailureKind.TIMED_OUT: "Extraction timed out. The document may be too large or complex.",
    ExtractionFailureKind.UNREADABLE: "I couldn't make sense of what I read in this document. Try re-extracting it.",
    ExtractionFailureKind.CUT_OFF: (
        "This document has more in it than I can read in one go, so re-extracting it won't help. "
        "Upload it in smaller parts, a few pages at a time."
    ),
    ExtractionFailureKind.MISCONFIGURED: "There's a problem connecting to the AI service. Please contact support.",
    ExtractionFailureKind.REJECTED: (
        "The AI service couldn't read this document. Check that the file opens, then re-upload it."
    ),
    ExtractionFailureKind.OTHER: "An unexpected error occurred during extraction. Try re-extracting this document.",
}
UPLOAD_SAVE_FAILED_MESSAGE: Final = (
    "Something went wrong while saving the extraction results. Try re-extracting this document."
)

# The poll loop touches this after every successful look for work and after
# every document it finishes, so it only goes stale when the loop stops
# making progress.
HEARTBEAT_PATH: Final = Path(tempfile.gettempdir()) / "mbk-upload-processor-heartbeat"

# Headroom over one extraction (EXTRACTION_TIMEOUT_SECONDS) for the claim and
# status-update DB round trips around it.
HEARTBEAT_EXTRACTION_HEADROOM_SECONDS: Final = 120

# A busy loop beats once per finished document, so the heartbeat may
# legitimately be one extraction (EXTRACTION_TIMEOUT_SECONDS: two Claude reads
# of claude_timeout_seconds + 30, plus 60s to save = 1320s by default) plus the
# headroom above old. 25 minutes leaves room over the default; the worker
# refuses to boot if CLAUDE_TIMEOUT_SECONDS is raised past it
# (``app/core/upload_processor_guard.py``), since the healthcheck would then
# flag a healthy worker mid-extraction.
HEARTBEAT_MAX_AGE_SECONDS: Final = 25 * 60
