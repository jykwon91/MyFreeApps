import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import cast

from app.core.context import RequestContext
from app.db.session import unit_of_work
from app.models.email.email_types import DiscoverResult, EmailSourcesData
from app.core.config import settings
from app.repositories import document_repo, email_queue_repo, integration_repo, sync_log_repo
from app.services.email.gmail_service import get_gmail_service, list_email_document_sources, list_new_email_ids

logger = logging.getLogger(__name__)


async def discover_gmail_emails(ctx: RequestContext) -> DiscoverResult:
    """Fetch new email IDs from Gmail and insert per-attachment queue items."""
    org_id = ctx.organization_id
    async with unit_of_work() as db:
        integration = await integration_repo.get_by_org_and_provider(db, org_id, "gmail")
        if not integration:
            return DiscoverResult("skipped", reason="no_integration")

        stuck_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        await sync_log_repo.timeout_stuck(db, org_id, "gmail", stuck_cutoff)

        running = await sync_log_repo.count_running(db, org_id, "gmail")
        if running:
            return DiscoverResult("skipped", reason="sync_already_running")

        await email_queue_repo.reset_stuck(db, org_id, ["extracting"], "fetched")

        service = get_gmail_service(integration.access_token, integration.refresh_token)

        queued_ids = await email_queue_repo.get_message_ids(db, org_id)
        doc_ids = await document_repo.get_email_message_ids(db, org_id)
        processed_ids: set[str] = queued_ids | doc_ids

        label = settings.gmail_label or None
        new_ids: list[str] = await asyncio.to_thread(list_new_email_ids, service, processed_ids, label=label)
        logger.info("Gmail discovery: %d new emails found (skipped %d)", len(new_ids), len(processed_ids))

        if not new_ids:
            await sync_log_repo.create(
                db, org_id, ctx.user_id, "gmail", "success",
                records_added=0,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
            return DiscoverResult("nothing_new")

        log = await sync_log_repo.create(db, org_id, ctx.user_id, "gmail", "running", started_at=datetime.now(timezone.utc))

        total_sources = 0
        for message_id in new_ids:
            try:
                sources_data = cast(
                    EmailSourcesData,
                    await asyncio.to_thread(list_email_document_sources, service, message_id),
                )
            except Exception:
                logger.warning("Failed to enumerate sources for email %s, skipping", message_id)
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
            return DiscoverResult("nothing_new")

        log.total_items = total_sources

        logger.info(
            "Gmail discovery: queued %d document sources from %d emails under sync_log_id=%d",
            total_sources, len(new_ids), log.id,
        )
        return DiscoverResult("queued", count=total_sources, sync_log_id=log.id)
