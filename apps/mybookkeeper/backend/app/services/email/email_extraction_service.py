import asyncio
import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import cast

from platform_shared.extraction import RateLimitPausedError, rate_limit_pause_seconds

from app.core.context import RequestContext
from app.core.document_constants import (
    EXTRACTION_CLAIM_LIFETIME_SECONDS,
    EXTRACTION_TIMEOUT_SECONDS,
)
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.email.claimed_queue_item import ClaimedQueueItem
from app.models.email.email_types import (
    Attachment,
    EmailBodyData,
    ExtractResult,
    ParsedEml,
)
from app.models.extraction.extraction_types import ExtractionResult
from app.repositories import email_queue_repo, integration_repo, sync_log_repo
from app.services.calendar.booking_ingestion_service import ingest_booking_email
from app.services.email.constants import (
    EMAIL_EXTRACTION_GAVE_UP_SUFFIX,
    EMAIL_EXTRACTION_INTERRUPTED_ERROR,
    EMAIL_EXTRACTION_MAX_ATTEMPTS,
    EMAIL_EXTRACTION_WAIT_CHECK_SECONDS,
    EMAIL_NO_CONTENT_ERROR,
    EMAIL_SYNC_INTERRUPTED_ERROR,
)
from app.services.email.email_extraction_retry import failure_reason
from app.services.extraction.claude_retry_policy import (
    classify_extraction_failure,
    next_attempt_at,
)
from app.services.extraction.claude_service import (
    extract_from_email,
    extract_from_image,
    extract_from_text,
)
from app.services.extraction.extraction_persistence import save_email_extraction
from app.services.extraction.extractor_service import (
    detect_file_type,
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_spreadsheet,
    parse_eml,
)

logger = logging.getLogger(__name__)


async def drain_claude_extraction(ctx: RequestContext, sync_log_id: int | None = None) -> int:
    """Run Claude extraction on all fetched queue items. Returns count of documents created.

    An item that failed for a passing reason waits in the queue until its
    ``next_attempt_at``; once nothing else is due, the drain waits for the
    soonest such retry, so every retry runs (and ends ``done`` or ``failed``)
    within this sync. Attempts are capped, so the wait is too. While Anthropic
    is rate limiting us the drain waits that out instead of spending attempts
    on reads that would be rate limited too. Every pass, and every few seconds
    of any wait, checks for a cancel and marks the sync as still going.
    """
    total = 0
    while True:
        if not await _still_wanted(sync_log_id):
            break

        pause = rate_limit_pause_seconds()
        if pause > 0:
            logger.info("Anthropic is rate limiting; pausing email extraction %.0fs for org %s", pause, ctx.organization_id)
            if not await _wait(pause, sync_log_id):
                break
            continue

        result = await _extract_next_fetched(ctx)

        if result.status == "nothing_to_extract":
            async with AsyncSessionLocal() as db:
                retry_at = await email_queue_repo.next_retry_at(db, ctx.organization_id)
            if retry_at is None:
                break
            wait = max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
            logger.info("Waiting %.0fs for the next email extraction retry for org %s", wait, ctx.organization_id)
            if not await _wait(wait, sync_log_id):
                break
            continue
        total += result.records_added

    if total > 0:
        async with unit_of_work() as db:
            integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
            if integration:
                await integration_repo.update_last_synced(db, integration, datetime.now(timezone.utc))

    return total


async def _wait(seconds: float, sync_log_id: int | None) -> bool:
    """Sleep ``seconds`` in short steps. False as soon as the sync is cancelled."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + seconds
    while (remaining := deadline - loop.time()) > 0:
        await asyncio.sleep(min(remaining, EMAIL_EXTRACTION_WAIT_CHECK_SECONDS))
        if not await _still_wanted(sync_log_id):
            return False
    return True


async def _still_wanted(sync_log_id: int | None) -> bool:
    """Mark the sync as still going, and say whether it was cancelled.

    The progress stamp is what keeps a long sync from being timed out as
    stuck (SYNC_STALE_AFTER_SECONDS). A drain with no sync log can't be
    cancelled.
    """
    if sync_log_id is None:
        return True
    async with unit_of_work() as db:
        await sync_log_repo.touch_progress(db, sync_log_id)
        if await sync_log_repo.is_cancelled(db, sync_log_id):
            logger.info("Extraction cancelled for sync_log_id=%d", sync_log_id)
            return False
    return True


async def finalize_sync_log(sync_log_id: int, ctx: RequestContext) -> None:
    """Mark sync log based on final queue state: success, partial, failed, or cancelled."""
    async with unit_of_work() as db:
        log = await sync_log_repo.get_by_id(db, sync_log_id)
        if not log or log.status != "running":
            return

        is_cancelled = log.cancelled_at is not None
        counts = await email_queue_repo.get_status_counts_for_sync(db, sync_log_id)
        done_count = counts.get("done", 0)
        failed_count = counts.get("failed", 0)

        if is_cancelled:
            await sync_log_repo.mark_completed(db, log, "cancelled", error="Cancelled by user")
        elif failed_count > 0 and done_count > 0:
            await sync_log_repo.mark_completed(
                db, log, "partial",
                error=f"{failed_count} item(s) failed, {done_count} succeeded",
            )
        elif failed_count > 0 and done_count == 0:
            await sync_log_repo.mark_completed(db, log, "failed", error=f"All {failed_count} item(s) failed")
        else:
            await sync_log_repo.mark_completed(db, log, "success")

        integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
        if integration:
            await integration_repo.update_last_synced(db, integration, datetime.now(timezone.utc))


async def close_interrupted_sync_log(sync_log_id: int) -> None:
    """Close a sync the scheduler stopped mid-way, so the next discovery doesn't skip as already running."""
    async with unit_of_work() as db:
        if await sync_log_repo.close_if_running(db, sync_log_id, "cancelled", error=EMAIL_SYNC_INTERRUPTED_ERROR):
            logger.info("Sync log %d closed: interrupted by a restart", sync_log_id)


async def _extract_next_fetched(ctx: RequestContext) -> ExtractResult:
    """Claim one item that is ready to read and run Claude extraction on it."""
    now = datetime.now(timezone.utc)
    async with unit_of_work() as db:
        item = await email_queue_repo.claim_next_fetched(
            db,
            ctx.organization_id,
            now=now,
            stale_before=now - timedelta(seconds=EXTRACTION_CLAIM_LIFETIME_SECONDS),
        )
        if not item:
            return ExtractResult("nothing_to_extract")

        claimed = ClaimedQueueItem(
            id=item.id,
            message_id=item.message_id,
            sync_log_id=item.sync_log_id,
            attachment_id=item.attachment_id,
            attachment_filename=item.attachment_filename,
            attachment_content_type=item.attachment_content_type,
            email_subject=item.email_subject,
            raw_content=item.raw_content,
            fetched_on=item.created_at.astimezone(timezone.utc).date(),
            attempts=item.attempts,
            claimed_at=now,
        )

    if claimed.attempts > EMAIL_EXTRACTION_MAX_ATTEMPTS:
        # Only a claim left behind by a drain that died gets here: every claim
        # counts, so an email whose read keeps killing the worker stops too.
        logger.error(
            "Queue item %s was claimed %d times without finishing; failing it",
            claimed.id, claimed.attempts,
        )
        reason = EMAIL_EXTRACTION_INTERRUPTED_ERROR + EMAIL_EXTRACTION_GAVE_UP_SUFFIX.format(
            attempts=EMAIL_EXTRACTION_MAX_ATTEMPTS,
        )
        return await _end_claim(claimed, error=reason, retry_at=None)

    if claimed.raw_content is None:
        return await _end_claim(claimed, error=EMAIL_NO_CONTENT_ERROR, retry_at=None)

    try:
        return await _extract_claimed(ctx, claimed, claimed.raw_content)
    except RateLimitPausedError as e:
        return await _release_claim(claimed, e)
    except asyncio.CancelledError:
        # The scheduler is stopping (a deploy). Hand the email back, due now and
        # uncounted, under shield so the write survives the cancellation.
        await asyncio.shield(_hand_back_interrupted(claimed))
        raise
    except Exception as e:
        return await _record_failed_attempt(claimed, e)


async def _release_claim(claimed: ClaimedQueueItem, exc: RateLimitPausedError) -> ExtractResult:
    """The read never reached Claude (rate limit still in force): requeue for when it lifts, uncounted."""
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=exc.retry_after_seconds)
    logger.info(
        "Queue item %s not read: Anthropic rate limit in force; requeued for %s without counting an attempt",
        claimed.id, retry_at.isoformat(),
    )
    async with unit_of_work() as db:
        if not await email_queue_repo.release_claim(db, claimed.id, claimed.claimed_at, retry_at=retry_at):
            return _discarded(claimed)
    return ExtractResult("retry_scheduled")


async def _hand_back_interrupted(claimed: ClaimedQueueItem) -> None:
    """The read was stopped by a shutdown, not by Claude: requeue it, due now, uncounted."""
    async with unit_of_work() as db:
        released = await email_queue_repo.release_claim(
            db, claimed.id, claimed.claimed_at, retry_at=datetime.now(timezone.utc),
        )
    if released:
        logger.info("Queue item %s handed back uncounted: its read was interrupted by a shutdown", claimed.id)


async def _extract_claimed(ctx: RequestContext, claimed: ClaimedQueueItem, raw_content: bytes) -> ExtractResult:
    extraction: tuple[ExtractionResult, Attachment | None] | None
    sender_email: str | None = None
    if claimed.attachment_id == "body":
        email_data = cast(EmailBodyData, json.loads(raw_content.decode("utf-8")))
        logger.info("Extracting body for queue item %s (message id=%s)", claimed.id, claimed.message_id)
        sender_email = email_data.get("from_address")

        # --- Booking ingestion pre-check ---
        # Attempt to classify the email as a booking confirmation before
        # calling Claude. If the email is routed as a booking (matched,
        # queued, or blocked), mark the queue item terminal and skip Claude
        # to save tokens and avoid creating spurious invoice Documents.
        ingestion_result = await ingest_booking_email(
            ctx=ctx,
            email_message_id=claimed.message_id,
            from_address=email_data.get("from_address"),
            subject=email_data["subject"],
            body=email_data["body"],
            # Rows fetched before sent_on was stored fall back to when they were fetched.
            sent_on=(
                date.fromisoformat(email_data["sent_on"])
                if "sent_on" in email_data else claimed.fetched_on
            ),
        )
        if ingestion_result.action in ("auto_matched", "queued_for_review", "blocked"):
            logger.info(
                "Email routed as booking: email_id=%s action=%s — skipping Claude",
                claimed.message_id,
                ingestion_result.action,
            )
            async with unit_of_work() as db:
                item_ref = await email_queue_repo.lock_claim(db, claimed.id, claimed.claimed_at)
                if item_ref is None:
                    return _discarded(claimed)
                await email_queue_repo.mark_status(db, item_ref, "processed_as_booking")
                log = await sync_log_repo.get_by_id(db, claimed.sync_log_id)
                if log:
                    await sync_log_repo.increment_records(db, log, 0)
            return ExtractResult("done", records_added=0)
        # action is "not_a_booking" or "unparseable" — fall through to Claude

        ext_result = cast(ExtractionResult, await asyncio.wait_for(
            extract_from_email(email_data["subject"], email_data["body"], user_id=ctx.user_id),
            timeout=EXTRACTION_TIMEOUT_SECONDS,
        ))
        extraction = (ext_result, None)
    else:
        attachment = Attachment(
            filename=claimed.attachment_filename or "attachment",
            content_type=claimed.attachment_content_type or "application/octet-stream",
            data=raw_content,
        )
        logger.info("Extracting attachment for queue item %s (message id=%s)", claimed.id, claimed.message_id)
        raw_result = await asyncio.wait_for(
            _extract_from_attachment(attachment, user_id=ctx.user_id),
            timeout=EXTRACTION_TIMEOUT_SECONDS,
        )
        extraction = (raw_result, attachment) if raw_result else None

    records_added = 0
    skip_reason: str | None = None
    async with unit_of_work() as db:
        # Write nothing unless the row is still ours: the user may have
        # dismissed it, or (past EXTRACTION_CLAIM_LIFETIME_SECONDS) another
        # drain may have taken it back, while Claude was reading.
        item_ref = await email_queue_repo.lock_claim(db, claimed.id, claimed.claimed_at)
        if item_ref is None:
            return _discarded(claimed)
        if extraction:
            outcome = await save_email_extraction(
                message_id=claimed.message_id,
                subject=claimed.email_subject,
                result=extraction[0],
                source_att=extraction[1],
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                db=db,
                sender_email=sender_email,
            )
            records_added = outcome.records_added
            skip_reason = outcome.skip_reason

        # Mark 'done' regardless of records_added. Reason: many
        # legitimate skip paths (dedup hit on a duplicate, low-
        # confidence + uncategorized, payment-confirmation
        # notification) all produce 0 documents — re-fetching them
        # on every sync wastes Claude tokens for no value. The
        # ``skipped`` status remains available for explicit use
        # (e.g. an admin-triggered 're-process this email' flow)
        # but is NOT applied automatically.
        #
        # When the email produced no records, persist the REASON on
        # the row so the Sync Sessions UI can explain it — closing the
        # silent-drop observability gap (utility bills used to vanish
        # here with no trace).
        #
        # A failed Claude read never reaches here: it raises, and
        # _record_failed_attempt keeps the row in the queue.
        await email_queue_repo.mark_done(db, item_ref, reason=skip_reason)

        log = await sync_log_repo.get_by_id(db, claimed.sync_log_id)
        if log:
            await sync_log_repo.increment_records(db, log, records_added)

    return ExtractResult("done", records_added=records_added)


async def _record_failed_attempt(claimed: ClaimedQueueItem, exc: Exception) -> ExtractResult:
    """Put the row back in the queue for a passing failure, or fail it.

    Retryable failures (see is_retryable_extraction_error) get another
    attempt after a delay until EMAIL_EXTRACTION_MAX_ATTEMPTS runs out; the
    row then shows as ``failed`` with a plain reason, for the user to retry.
    The exception itself goes to the log.
    """
    failure = classify_extraction_failure(exc)
    will_retry = failure.retryable and claimed.attempts < EMAIL_EXTRACTION_MAX_ATTEMPTS
    retry_at = next_attempt_at(claimed.attempts, exc, datetime.now(timezone.utc)) if will_retry else None
    reason = failure_reason(failure, attempts=claimed.attempts, will_retry=will_retry)
    if retry_at is not None:
        logger.warning(
            "Extraction of queue item %s failed (%s: %s, attempt %d/%d); retrying at %s",
            claimed.id, failure.kind, type(exc).__name__, claimed.attempts,
            EMAIL_EXTRACTION_MAX_ATTEMPTS, retry_at.isoformat(),
        )
    else:
        logger.error(
            "Failed to extract queue item %s (%s, attempt %d/%d, retryable=%s)",
            claimed.id, failure.kind, claimed.attempts, EMAIL_EXTRACTION_MAX_ATTEMPTS, failure.retryable,
            exc_info=exc,
        )
    return await _end_claim(claimed, error=reason, retry_at=retry_at)


async def _end_claim(claimed: ClaimedQueueItem, *, error: str, retry_at: datetime | None) -> ExtractResult:
    async with unit_of_work() as db:
        if not await email_queue_repo.record_failed_attempt(
            db, claimed.id, claimed.claimed_at, error=error, retry_at=retry_at,
        ):
            return _discarded(claimed)
    return ExtractResult("retry_scheduled" if retry_at is not None else "failed", error=error)


def _discarded(claimed: ClaimedQueueItem) -> ExtractResult:
    logger.info(
        "Queue item %s was dismissed or taken back during its read; dropping the result",
        claimed.id,
    )
    return ExtractResult("discarded")


async def _extract_from_attachment(
    attachment: Attachment, user_id: uuid.UUID | None = None,
) -> ExtractionResult | None:
    filename: str = attachment["filename"]
    content: bytes = attachment["data"]
    content_type: str = attachment["content_type"]
    file_type = detect_file_type(filename, content_type)

    if file_type == "image":
        return cast(ExtractionResult, await extract_from_image(content, content_type, user_id=user_id))
    if file_type == "pdf":
        text = await extract_text_from_pdf(content)
        if text:
            return cast(ExtractionResult, await extract_from_text(text, user_id=user_id))
        return cast(ExtractionResult, await extract_from_image(content, "application/pdf", user_id=user_id))
    if file_type == "docx":
        text = await extract_text_from_docx(content)
        return cast(ExtractionResult, await extract_from_text(text, user_id=user_id))
    if file_type == "spreadsheet":
        text = await extract_text_from_spreadsheet(content, filename)
        return cast(ExtractionResult, await extract_from_text(text, user_id=user_id))
    if file_type == "eml":
        parsed = cast(ParsedEml, parse_eml(content))
        for nested in parsed["attachments"]:
            result = await _extract_from_attachment(nested, user_id=user_id)
            if result:
                return result
        if parsed["body"]:
            return cast(ExtractionResult, await extract_from_text(parsed["body"], user_id=user_id))
    return None
