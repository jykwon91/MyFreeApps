import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import cast

from google.auth.exceptions import RefreshError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.email.email_types import EmailBodyData, FetchResult
from app.repositories import email_queue_repo, integration_repo, sync_log_repo
from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_service import fetch_attachment_bytes, fetch_email_body, get_gmail_service

logger = logging.getLogger(__name__)

CANCELLATION_CHECK_INTERVAL = 5


async def drain_gmail_fetch(ctx: RequestContext, sync_log_id: int | None = None) -> None:
    """Download bytes from Gmail for all pending queue items, one at a time.

    Stops immediately if a GmailReauthRequiredError is raised — the token is
    dead for this integration, so there is no point retrying the remaining items.
    """
    items_processed = 0
    while True:
        if sync_log_id is not None and items_processed % CANCELLATION_CHECK_INTERVAL == 0:
            async with AsyncSessionLocal() as db:
                if await sync_log_repo.is_cancelled(db, sync_log_id):
                    logger.info("Fetch cancelled for sync_log_id=%d", sync_log_id)
                    break

        try:
            result = await asyncio.wait_for(
                _fetch_next_pending(ctx),
                timeout=settings.email_fetch_timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning("Fetch timed out for org %s, failing stuck items and continuing", ctx.organization_id)
            async with unit_of_work() as db:
                await email_queue_repo.reset_stuck(db, ctx.organization_id, ["pending"], "failed", error="Fetch timed out")
            continue
        except GmailReauthRequiredError:
            logger.warning(
                "Stopping fetch drain for org=%s — Gmail token expired, needs_reauth already set",
                ctx.organization_id,
            )
            return

        if result.status == "nothing_to_fetch":
            break
        # "failed" continues to next item
        items_processed += 1


async def _fetch_next_pending(ctx: RequestContext) -> FetchResult:
    """Claim one pending item and download its bytes from Gmail."""
    async with unit_of_work() as db:
        item = await email_queue_repo.claim_next_pending(db, ctx.organization_id)
        if not item:
            return FetchResult("nothing_to_fetch")

        item_id: uuid.UUID = item.id
        message_id: str = item.message_id
        sync_log_id: int = item.sync_log_id
        attachment_id: str = item.attachment_id

    async with AsyncSessionLocal() as db:
        integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
        if not integration:
            async with unit_of_work() as db2:
                failed_item = await email_queue_repo.get_by_id(db2, item_id)
                if failed_item:
                    await email_queue_repo.mark_status(db2, failed_item, "failed", error="No Gmail integration found")
            return FetchResult("failed", error="No Gmail integration found")
        access_token: str = integration.access_token
        refresh_token: str | None = integration.refresh_token

    try:
        service = get_gmail_service(access_token, refresh_token)

        raw_bytes: bytes
        if attachment_id == "body":
            email_data = cast(
                EmailBodyData,
                await asyncio.to_thread(fetch_email_body, service, message_id),
            )
            raw_bytes = json.dumps(email_data).encode("utf-8")
        else:
            raw_bytes = await asyncio.to_thread(fetch_attachment_bytes, service, message_id, attachment_id)

        logger.info("Fetched %d bytes for queue item %s (attachment=%s)", len(raw_bytes), item_id, attachment_id)

        async with unit_of_work() as db:
            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                await email_queue_repo.store_fetched_content(db, item_ref, raw_bytes)

            await _complete_sync_log_if_done(db, sync_log_id, ctx)

        return FetchResult("fetched")

    except RefreshError as exc:
        logger.warning(
            "Gmail refresh token rejected for org=%s while fetching queue item %s: %s",
            ctx.organization_id, item_id, exc,
        )
        async with unit_of_work() as db:
            integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
            if integration:
                await integration_repo.mark_needs_reauth(
                    db, integration, repr(exc)[:200], datetime.now(timezone.utc)
                )
            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                await email_queue_repo.mark_status(db, item_ref, "failed", error="Gmail auth expired")
        raise GmailReauthRequiredError(str(exc)) from exc

    except Exception as e:
        logger.exception("Failed to fetch queue item %s", item_id)
        async with unit_of_work() as db:
            item_ref = await email_queue_repo.get_by_id(db, item_id)
            if item_ref:
                await email_queue_repo.mark_status(db, item_ref, "failed", error=str(e)[:1000])

            await _fail_sync_log_if_done(db, sync_log_id, str(e))
        return FetchResult("failed", error=str(e))


async def _complete_sync_log_if_done(
    db: AsyncSession, sync_log_id: int, ctx: RequestContext
) -> None:
    """Mark sync log as success if no more pending items remain."""
    log = await sync_log_repo.get_by_id(db, sync_log_id)
    if not log:
        return
    pending = await email_queue_repo.count_pending_for_sync(db, sync_log_id)
    if pending == 0:
        await sync_log_repo.mark_completed(db, log, "success")
        integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
        if integration:
            await integration_repo.update_last_synced(db, integration, datetime.now(timezone.utc))


async def _fail_sync_log_if_done(
    db: AsyncSession, sync_log_id: int, error_msg: str
) -> None:
    """Mark sync log as failed if no more pending items remain."""
    log = await sync_log_repo.get_by_id(db, sync_log_id)
    if not log:
        return
    pending = await email_queue_repo.count_pending_for_sync(db, sync_log_id)
    if pending == 0:
        await sync_log_repo.mark_completed(db, log, "failed", error=error_msg[:1000])
