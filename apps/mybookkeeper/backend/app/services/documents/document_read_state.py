"""Is the extraction worker currently reading a document?"""
from datetime import datetime, timedelta, timezone

from app.core.document_constants import (
    EXTRACTION_TIMEOUT_SECONDS,
    STALE_EXTRACTION_MARGIN_SECONDS,
)
from app.models.documents.document import Document

_CLAIM_LIFETIME = timedelta(seconds=EXTRACTION_TIMEOUT_SECONDS + STALE_EXTRACTION_MARGIN_SECONDS)


def is_claimed_by_worker(doc: Document, now: datetime | None = None) -> bool:
    """True while a worker holds a fresh claim.

    The claim commits ``status='extracting'``, which stamps ``updated_at``; nothing
    touches the row again until the worker finishes. A claim older than the worker
    timeout plus a margin was left by a worker that died.
    """
    if doc.status != "extracting":
        return False
    claimed_at = doc.updated_at
    if claimed_at.tzinfo is None:
        claimed_at = claimed_at.replace(tzinfo=timezone.utc)
    return (now or datetime.now(timezone.utc)) - claimed_at < _CLAIM_LIFETIME


def is_being_read(doc: Document, now: datetime | None = None) -> bool:
    """Queued for extraction, or claimed by a live worker."""
    return doc.status == "processing" or is_claimed_by_worker(doc, now)
