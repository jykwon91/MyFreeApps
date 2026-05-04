import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import cast

from app.core.config import settings
from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.email.email_types import Attachment, EmailBodyData, ExtractResult, ParsedEml
from app.models.extraction.extraction_types import ExtractionResult
from app.repositories import email_queue_repo, integration_repo, sync_log_repo
from app.services.extraction.claude_service import extract_from_email, extract_from_image, extract_from_text
from app.services.extraction.extraction_persistence import save_email_extraction
from app.services.extraction.extractor_service import (
    detect_file_type,
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_spreadsheet,
    parse_eml,
)

logger = logging.getLogger(__name__)

CANCELLATION_CHECK_INTERVAL = 5


async def drain_claude_extraction(ctx: RequestContext, sync_log_id: int | None = None) -> int:
    """Run Claude extraction on all fetched queue items. Returns count of documents created."""
    total = 0
    items_processed = 0
    while True:
        if sync_log_id is not None and items_processed % CANCELLATION_CHECK_INTERVAL == 0:
            async with AsyncSessionLocal() as db:
                if await sync_log_repo.is_cancelled(db, sync_log_id):
                    logger.info("Extraction cancelled for sync_log_id=%d", sync_log_id)
                    break

        try:
            result = await asyncio.wait_for(
                _extract_next_fetched(ctx),
                timeout=settings.email_extraction_timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning("Extraction timed out for org %s, failing stuck items and continuing", ctx.organization_id)
            async with unit_of_work() as db:
                await email_queue_repo.reset_stuck(db, ctx.organization_id, ["extracting"], "failed", error="Extraction timed out")
            items_processed += 1
            continue

        if result.status == "nothing_to_extract":
            break
        # "failed" continues to next item
        total += result.records_added
        items_processed += 1

    if total > 0:
        async with unit_of_work() as db:
            integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
            if integration:
                await integration_repo.update_last_synced(db, integration, datetime.now(timezone.utc))

    return total


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


async def _extract_next_fetched(ctx: RequestContext) -> ExtractResult:
    """Claim one fetched item and run Claude extraction on it."""
    async with unit_of_work() as db:
        item = await email_queue_repo.claim_next_fetched(db, ctx.organization_id)
        if not item:
            return ExtractResult("nothing_to_extract")

        item.status = "extracting"
        item_id: uuid.UUID = item.id
        message_id: str = item.message_id
        sync_log_id: int = item.sync_log_id
        attachment_id: str = item.attachment_id
        attachment_filename: str | None = item.attachment_filename
        attachment_content_type: str | None = item.attachment_content_type
        email_subject: str | None = item.email_subject
        raw_content: bytes | None = item.raw_content

    if raw_content is None:
        async with unit_of_work() as db:
            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                await email_queue_repo.mark_status(db, item_ref, "failed", error="No raw content to extract")
        return ExtractResult("failed", error="No raw content to extract")

    try:
        extraction: tuple[ExtractionResult, Attachment | None] | None
        if attachment_id == "body":
            email_data = cast(EmailBodyData, json.loads(raw_content.decode("utf-8")))
            logger.info("Extracting body for email id=%s subject=%r", message_id, email_data.get("subject"))
            ext_result = cast(ExtractionResult, await extract_from_email(email_data["subject"], email_data["body"], user_id=ctx.user_id))
            extraction = (ext_result, None)
        else:
            attachment = Attachment(
                filename=attachment_filename or "attachment",
                content_type=attachment_content_type or "application/octet-stream",
                data=raw_content,
            )
            logger.info("Extracting attachment %r for email id=%s", attachment_filename, message_id)
            raw_result = await _extract_from_attachment(attachment, user_id=ctx.user_id)
            if raw_result:
                extraction = (raw_result, attachment)
            else:
                extraction = None

        records_added = 0
        async with unit_of_work() as db:
            if extraction:
                records_added = await save_email_extraction(
                    message_id=message_id,
                    subject=email_subject,
                    result=extraction[0],
                    source_att=extraction[1],
                    organization_id=ctx.organization_id,
                    user_id=ctx.user_id,
                    db=db,
                )

            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                # Distinguish 'extraction succeeded and produced documents' (done)
                # from 'extraction succeeded but produced no documents' (skipped —
                # e.g. payment-confirmation duplicate). Skipped rows are
                # re-fetchable on the next sync so a future prompt improvement
                # can give the email another chance — see
                # email_queue_repo.get_message_ids for the dedup rule.
                if records_added > 0:
                    await email_queue_repo.mark_done(db, item_ref)
                else:
                    await email_queue_repo.mark_skipped(
                        db, item_ref, reason="extraction returned 0 documents",
                    )

            log = await sync_log_repo.get_by_id(db, sync_log_id)
            if log:
                await sync_log_repo.increment_records(db, log, records_added)

        return ExtractResult("done", records_added=records_added)

    except Exception as e:
        logger.exception("Failed to extract queue item %s", item_id)
        async with unit_of_work() as db:
            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                await email_queue_repo.mark_status(db, item_ref, "failed", error=str(e)[:1000])
        return ExtractResult("failed", error=str(e))


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
