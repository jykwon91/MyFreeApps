import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import cast

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.db.session import unit_of_work
from app.models.email.bounce_detection_result import BounceDetectionResult
from app.models.email.email_types import DiscoverResult, EmailSourcesData
from app.models.email.inbound_email_signals import InboundEmailSignals
from app.core.config import settings
from app.repositories import document_repo, email_filter_log_repo, email_queue_repo, gmail_skipped_message_repo, integration_repo, sync_log_repo
from app.services.email.bounce_detector import BounceDetector
from app.services.email.constants import (
    EMAIL_FILTER_LOG_FROM_ADDRESS_MAX_LEN,
    EMAIL_FILTER_LOG_SUBJECT_MAX_LEN,
    GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
)
from app.services.email.exceptions import GmailAuthExpiredError
from app.services.email.gmail_service import (
    get_gmail_service,
    list_email_document_sources,
    list_new_email_ids,
    persist_refreshed_token,
)
from app.services.email.header_truncation import truncate_header

logger = logging.getLogger(__name__)


async def discover_gmail_emails(ctx: RequestContext) -> DiscoverResult:
    """Fetch new email IDs from Gmail and insert per-attachment queue items.

    Raises:
        GmailAuthExpiredError: Google rejected the stored refresh token. The
            caller is responsible for surfacing this to the user; this service
            records a failed sync_log row so the failure appears in the UI.
    """
    org_id = ctx.organization_id
    async with unit_of_work() as db:
        integration = await integration_repo.get_by_org_and_provider(db, org_id, "gmail")
        if not integration:
            return DiscoverResult("skipped", reason="no_integration")

        now = datetime.now(timezone.utc)
        stuck_cutoff = now - timedelta(minutes=30)
        await sync_log_repo.timeout_stuck(db, org_id, "gmail", stuck_cutoff)

        running = await sync_log_repo.count_running(db, org_id, "gmail")
        if running:
            return DiscoverResult("skipped", reason="sync_already_running")

        await email_queue_repo.reset_stuck(db, org_id, ["extracting"], "fetched")

        service, creds = get_gmail_service(integration.access_token, integration.refresh_token)
        prior_token = creds.token

        queued_ids = await email_queue_repo.get_message_ids(db, org_id)
        doc_ids = await document_repo.get_email_message_ids(db, org_id)
        # Filter-logged messages are permanently excluded: bounces (re-listing
        # them would just re-run the same deterministic detection every sync)
        # and app-sent mail (rent receipts / inquiry replies recorded at send
        # time by app_sent_email_service — re-ingesting those would re-extract
        # the app's own output as duplicate transactions).
        filtered_ids = await email_filter_log_repo.get_message_ids(db, org_id)
        processed_ids: set[str] = queued_ids | doc_ids | filtered_ids

        label = settings.gmail_label or None
        try:
            new_ids, gmail_matches_total = await asyncio.to_thread(
                list_new_email_ids, service, processed_ids, label=label
            )
        except RefreshError as exc:
            await integration_repo.mark_needs_reauth(
                db, integration, repr(exc)[:200], datetime.now(timezone.utc)
            )
            await _record_auth_expired_sync_log(db, ctx)
            logger.warning(
                "Gmail refresh token rejected for org=%s user=%s during discovery: %s",
                org_id, ctx.user_id, exc,
            )
            raise GmailAuthExpiredError(str(exc)) from exc
        except HttpError as exc:
            status = getattr(getattr(exc, "resp", None), "status", None)
            if status == 401:
                await integration_repo.mark_needs_reauth(
                    db, integration, f"HttpError 401: {exc!r}"[:200], datetime.now(timezone.utc)
                )
                await _record_auth_expired_sync_log(db, ctx)
                logger.warning(
                    "Gmail token rejected (401) for org=%s user=%s during discovery: status=%s",
                    org_id, ctx.user_id, status,
                )
                raise GmailAuthExpiredError(str(exc)) from exc
            raise
        logger.info(
            "Gmail discovery: matched=%d new=%d (skipped %d already-processed)",
            gmail_matches_total, len(new_ids), gmail_matches_total - len(new_ids),
        )

        if not new_ids:
            await sync_log_repo.create(
                db, org_id, ctx.user_id, "gmail", "success",
                records_added=0,
                started_at=now,
                completed_at=now,
                gmail_matches_total=gmail_matches_total,
            )
            await integration_repo.update_last_synced(db, integration, now)
            await persist_refreshed_token(integration, creds, prior_token)
            return DiscoverResult("nothing_new")

        log = await sync_log_repo.create(
            db, org_id, ctx.user_id, "gmail", "running",
            started_at=now,
            gmail_matches_total=gmail_matches_total,
        )

        bounce_detector = BounceDetector()
        total_sources = 0
        filtered_count = 0
        for message_id in new_ids:
            try:
                sources_data = cast(
                    EmailSourcesData,
                    await asyncio.to_thread(list_email_document_sources, service, message_id),
                )
            except RefreshError as exc:
                await integration_repo.mark_needs_reauth(
                    db, integration, repr(exc)[:200], datetime.now(timezone.utc)
                )
                await sync_log_repo.mark_completed(db, log, "failed", error=GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)
                logger.warning(
                    "Gmail refresh token rejected for org=%s user=%s while fetching sources for message %s: %s",
                    org_id, ctx.user_id, message_id, exc,
                )
                raise GmailAuthExpiredError(str(exc)) from exc
            except HttpError as exc:
                status = getattr(getattr(exc, "resp", None), "status", None)
                if status == 401:
                    await integration_repo.mark_needs_reauth(
                        db, integration, f"HttpError 401: {exc!r}"[:200], datetime.now(timezone.utc)
                    )
                    await sync_log_repo.mark_completed(db, log, "failed", error=GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)
                    logger.warning(
                        "Gmail token rejected (401) for org=%s user=%s while fetching sources for message %s: status=%s",
                        org_id, ctx.user_id, message_id, status,
                    )
                    raise GmailAuthExpiredError(str(exc)) from exc
                # Non-401 HttpError — skip this message, don't abort the entire sync.
                logger.warning(
                    "gmail_discovery: skipped message_id=%s org=%s user=%s exc=%s msg=%s",
                    message_id, org_id, ctx.user_id, type(exc).__name__, exc,
                    exc_info=True,
                )
                await gmail_skipped_message_repo.record_skip(
                    db,
                    organization_id=org_id,
                    user_id=ctx.user_id,
                    gmail_message_id=message_id,
                    exc=exc,
                )
                continue
            except Exception as e:
                logger.warning(
                    "gmail_discovery: skipped message_id=%s org=%s user=%s exc=%s msg=%s",
                    message_id, org_id, ctx.user_id, type(e).__name__, e,
                    exc_info=True,
                )
                await gmail_skipped_message_repo.record_skip(
                    db,
                    organization_id=org_id,
                    user_id=ctx.user_id,
                    gmail_message_id=message_id,
                    exc=e,
                )
                continue

            bounce_result = _detect_bounce(bounce_detector, sources_data)
            if bounce_result.filtered and bounce_result.reason is not None:
                from_address = sources_data.get("from_address")
                subject = sources_data.get("subject")
                await email_filter_log_repo.insert_ignore_conflict(
                    db,
                    organization_id=org_id,
                    user_id=ctx.user_id,
                    message_id=message_id,
                    from_address=truncate_header(from_address, EMAIL_FILTER_LOG_FROM_ADDRESS_MAX_LEN),
                    subject=truncate_header(subject, EMAIL_FILTER_LOG_SUBJECT_MAX_LEN),
                    reason=bounce_result.reason,
                )
                filtered_count += 1
                logger.info(
                    "Filtered bounce email message_id=%s reason=%s subject=%r",
                    message_id, bounce_result.reason, subject,
                )
                continue

            for source in sources_data["sources"]:
                await email_queue_repo.insert_ignore_conflict(
                    db,
                    organization_id=org_id,
                    user_id=ctx.user_id,
                    message_id=message_id,
                    sync_log_id=log.id,
                    attachment_id=source["attachment_id"],
                    attachment_filename=source.get("filename"),
                    attachment_content_type=source.get("content_type"),
                    email_subject=sources_data["subject"],
                )
                total_sources += 1

        if total_sources == 0:
            await sync_log_repo.mark_completed(db, log, "success")
            await integration_repo.update_last_synced(db, integration, datetime.now(timezone.utc))
            if filtered_count:
                logger.info(
                    "Gmail discovery: filtered %d bounce/auto-reply emails for org=%s",
                    filtered_count, org_id,
                )
            await persist_refreshed_token(integration, creds, prior_token)
            return DiscoverResult("nothing_new")

        log.total_items = total_sources

        logger.info(
            "Gmail discovery: queued %d document sources from %d emails under sync_log_id=%d (filtered %d bounces)",
            total_sources, len(new_ids), log.id, filtered_count,
        )
        await persist_refreshed_token(integration, creds, prior_token)
        return DiscoverResult("queued", count=total_sources, sync_log_id=log.id)


def _detect_bounce(
    detector: BounceDetector, sources_data: EmailSourcesData
) -> BounceDetectionResult:
    signals = InboundEmailSignals(
        from_address=sources_data.get("from_address"),
        subject=sources_data.get("subject"),
        headers=sources_data.get("headers", {}),
        body_preview=sources_data.get("body_preview"),
    )
    return detector.detect(signals)


async def _record_auth_expired_sync_log(db: AsyncSession, ctx: RequestContext) -> None:
    """Record a failed sync_log row so the auth-expired failure is visible in the UI."""
    now = datetime.now(timezone.utc)
    log = await sync_log_repo.create(
        db, ctx.organization_id, ctx.user_id, "gmail", "running",
        started_at=now,
    )
    await sync_log_repo.mark_completed(db, log, "failed", error=GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)
