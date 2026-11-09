"""Document lifecycle constants."""
from app.core.config import settings

# Upper bound on ids accepted by POST /documents/bulk-delete. Mirrored by
# MAX_BULK_DELETE_DOCUMENT_IDS in the api-client.
MAX_BULK_DELETE_DOCUMENT_IDS = 500

# The worker abandons an extraction after this long (it must outlast the Claude call).
EXTRACTION_TIMEOUT_SECONDS = settings.claude_timeout_seconds + 30

# A claim ("extracting") older than the worker timeout plus this margin belongs to a
# worker that died, so the document no longer counts as being read.
STALE_EXTRACTION_MARGIN_SECONDS = 300

DOCUMENT_BEING_READ_DETAIL = "This document is still being read. Try again once extraction finishes."
