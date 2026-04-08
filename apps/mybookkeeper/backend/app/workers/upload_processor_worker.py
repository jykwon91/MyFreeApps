"""
Run with: python -m app.workers.upload_processor_worker
Polls for documents with status='processing' and runs Claude extraction.
Processes one document per user concurrently across multiple users.
Self-healing: transient errors trigger exponential backoff retries.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

import anthropic
import sqlalchemy.exc

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories import document_repo, system_event_repo
from app.services.extraction.document_extraction_service import process_document
from app.services.system.cost_service import check_cost_alerts
from app.services.system.event_service import record_event

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 2
EXTRACTION_TIMEOUT_SECONDS = settings.claude_timeout_seconds + 30  # worker timeout > Claude API timeout
MAX_CONCURRENT_USERS = 5
MAX_RETRIES = 3

_TRANSIENT_ERROR_TYPES = (
    anthropic.RateLimitError,
    anthropic.APIStatusError,
    asyncio.TimeoutError,
    ConnectionError,
    TimeoutError,
)


def _is_transient_error(exc: Exception) -> bool:
    if isinstance(exc, anthropic.RateLimitError):
        return True
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code < 500:
        return False
    return isinstance(exc, _TRANSIENT_ERROR_TYPES)


def _compute_next_retry(retry_count: int) -> datetime:
    delay_seconds = (2 ** retry_count) * 60
    return datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)


async def process_one_for_user(user_id: uuid.UUID) -> bool:
    """Claim and process one document for a specific user."""
    async with AsyncSessionLocal() as db:
        doc = await document_repo.claim_next_processing(db, user_id)
        if not doc:
            return False
        doc_id = doc.id
        org_id = doc.organization_id
        retry_count = doc.retry_count
        logger.info("Processing document %s for user %s (%s, retry=%d)", doc_id, user_id, doc.file_name, retry_count)

    try:
        await asyncio.wait_for(
            process_document(doc_id),
            timeout=EXTRACTION_TIMEOUT_SECONDS,
        )
        logger.info("Completed document %s", doc_id)
        # Auto-resolve any previous failure events for this document
        try:
            async with AsyncSessionLocal() as resolve_db:
                await system_event_repo.resolve_by_type(resolve_db, org_id, "extraction_failed")
                await resolve_db.commit()
        except Exception:
            pass
        try:
            msg = f"Document {doc_id} extracted successfully"
            if retry_count > 0:
                msg = f"Document {doc_id} succeeded after {retry_count} retries"
            await record_event(
                org_id,
                "extraction_retried" if retry_count > 0 else "extraction_completed",
                "info",
                msg,
                {"document_id": str(doc_id), "retry_count": retry_count},
            )
        except Exception:
            pass
        try:
            await check_cost_alerts(org_id)
        except Exception:
            pass
    except Exception as exc:
        logger.exception("Failed to process document %s", doc_id)
        transient = _is_transient_error(exc)
        if isinstance(exc, asyncio.TimeoutError):
            error_msg = "Extraction timed out. The document may be too large or complex."
        elif isinstance(exc, (sqlalchemy.exc.IntegrityError, sqlalchemy.exc.DBAPIError)):
            error_msg = "Something went wrong while saving the extraction results. Try re-extracting this document."
        elif isinstance(exc, anthropic.AuthenticationError):
            error_msg = "There's a problem connecting to the AI service. Please contact support."
        else:
            error_msg = "An unexpected error occurred during extraction. Try re-extracting this document."

        async with AsyncSessionLocal() as db:
            failed_doc = await document_repo.get_by_id_internal(db, doc_id)
            if failed_doc:
                new_retry_count = failed_doc.retry_count + 1
                if transient and new_retry_count < MAX_RETRIES:
                    failed_doc.retry_count = new_retry_count
                    failed_doc.next_retry_at = _compute_next_retry(new_retry_count)
                    failed_doc.status = "processing"
                    failed_doc.error_message = error_msg
                    logger.info(
                        "Transient error for document %s, scheduling retry %d at %s",
                        doc_id, new_retry_count, failed_doc.next_retry_at,
                    )
                else:
                    failed_doc.status = "failed"
                    failed_doc.error_message = error_msg
                await db.commit()

        severity = "warning" if transient else "error"
        event_msg = f"Document {doc_id} extraction failed: {error_msg[:200]}"
        try:
            await record_event(
                org_id, "extraction_failed", severity, event_msg,
                {
                    "document_id": str(doc_id),
                    "error": error_msg[:500],
                    "transient": transient,
                    "retry_count": retry_count + 1,
                },
            )
        except Exception:
            pass
    return True


async def drain_user(user_id: uuid.UUID) -> int:
    """Process all pending documents for one user, sequentially."""
    count = 0
    while await process_one_for_user(user_id):
        count += 1
    return count


async def drain() -> int:
    """Process documents for all users concurrently (one doc at a time per user)."""
    async with AsyncSessionLocal() as db:
        user_ids = await document_repo.get_processing_user_ids(db)

    if not user_ids:
        return 0

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_USERS)

    async def bounded_drain(uid: uuid.UUID) -> int:
        async with semaphore:
            return await drain_user(uid)

    results = await asyncio.gather(*[bounded_drain(uid) for uid in user_ids])
    return sum(results)


async def main() -> None:
    logger.info(
        "Upload processor started — polling every %ds, max %d concurrent users",
        POLL_INTERVAL_SECONDS, MAX_CONCURRENT_USERS,
    )
    while True:
        processed = await drain()
        if not processed:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
