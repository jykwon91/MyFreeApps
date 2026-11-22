"""Document lifecycle constants."""
from app.core.config import settings

# Upper bound on ids accepted by POST /documents/bulk-delete. Mirrored by
# MAX_BULK_DELETE_DOCUMENT_IDS in the api-client.
MAX_BULK_DELETE_DOCUMENT_IDS = 500

# Uploads and Gmail emails are read by queues that retry a failed item later
# (the upload worker's retry_count, the email queue's next_attempt_at), so a
# Claude read never sleeps: not on a 429 or the shared throttle (wait budget 0),
# and not on the SDK's own retries (max_retries 0). It raises and the queue
# tries the item again. Sleeping inside the call is what used to run past the
# item's time limit and turn a rate limit into "timed out".
CLAUDE_EXTRACTION_MAX_WAIT_SECONDS = 0.0
CLAUDE_EXTRACTION_MAX_SDK_RETRIES = 0

# One Claude read (one request, no retries) is abandoned after this long.
CLAUDE_READ_TIMEOUT_SECONDS = settings.claude_timeout_seconds + 30

# An item may take two reads: a PDF whose text read is unusable is read again
# as an image. Each read has its own limit, and the item's limit covers both
# plus the saving around them.
CLAUDE_READS_PER_ITEM = 2
EXTRACTION_SAVE_MARGIN_SECONDS = 60
EXTRACTION_TIMEOUT_SECONDS = CLAUDE_READS_PER_ITEM * CLAUDE_READ_TIMEOUT_SECONDS + EXTRACTION_SAVE_MARGIN_SECONDS

# A claim ("extracting") older than the worker timeout plus this margin belongs to a
# worker that died, so the document or email no longer counts as being read.
STALE_EXTRACTION_MARGIN_SECONDS = 300
EXTRACTION_CLAIM_LIFETIME_SECONDS = EXTRACTION_TIMEOUT_SECONDS + STALE_EXTRACTION_MARGIN_SECONDS

# Both queues wait before retrying a passing failure: attempt n waits
# BASE * 2**(n-1) seconds, or the retry-after Anthropic sent (on a 429 or a
# 529 overloaded) if that is longer, never more than MAX.
# Non-Claude failures of a read that clear on their own (the read timing out,
# a dropped socket), passed as ``extra_transient`` to
# ``platform_shared.extraction.is_transient_failure``. Claude's own failures
# carry their classification (``ExtractionError.kind``).
TRANSIENT_EXTRACTION_ERROR_TYPES: tuple[type[BaseException], ...] = (TimeoutError, ConnectionError)
CLAUDE_RETRY_BASE_DELAY_SECONDS = 60
CLAUDE_RETRY_MAX_DELAY_SECONDS = 300

DOCUMENT_BEING_READ_DETAIL = "This document is still being read. Try again once extraction finishes."

# Statuses the Home summary reports as still being read, and as needing a look.
DOCUMENT_IN_PROGRESS_STATUSES = ("processing", "extracting")
DOCUMENT_NEEDS_REVIEW_STATUSES = ("failed", "duplicate")
