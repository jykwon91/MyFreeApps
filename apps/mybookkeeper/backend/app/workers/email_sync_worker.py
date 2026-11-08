import logging

from app.core.context import worker_context
from app.db.session import AsyncSessionLocal
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.repositories import organization_repo
from app.services.email.email_processor_service import discover_gmail_emails, drain_gmail_fetch, drain_claude_extraction, finalize_sync_log
from app.services.email.exceptions import GmailAuthExpiredError, GmailLabelNotFoundError

logger = logging.getLogger(__name__)


async def sync_gmail_connection(target: GmailSyncTarget) -> None:
    """Full pipeline for one org's Gmail: discover emails, fetch bytes, then extract with Claude.

    Runs as the member who connected it. If they've left the org, nothing is
    synced: their mailbox no longer belongs to that org's books.

    A GmailAuthExpiredError means the refresh token has been invalidated by
    Google (password change, revoke, or test-app expiry). The discovery
    service already records a failed sync_log row; the worker logs a warning
    and returns cleanly so the scheduler loop keeps running for other orgs.
    """
    async with AsyncSessionLocal() as db:
        member = await organization_repo.get_member(db, target.organization_id, target.user_id)
    if member is None:
        logger.warning(
            "Gmail for org=%s was connected by user=%s, who is no longer a member -- skipping sync",
            target.organization_id, target.user_id,
        )
        return
    ctx = worker_context(target.organization_id, target.user_id)

    try:
        result = await discover_gmail_emails(ctx)
    except GmailAuthExpiredError:
        logger.warning(
            "Gmail auth expired for user=%s org=%s -- user must reconnect",
            target.user_id, target.organization_id,
        )
        return
    except GmailLabelNotFoundError:
        # Discovery already recorded a failed sync_log row naming the label.
        return

    sync_log_id = result.sync_log_id
    await drain_gmail_fetch(ctx, sync_log_id=sync_log_id)
    await drain_claude_extraction(ctx, sync_log_id=sync_log_id)
    if sync_log_id is not None:
        await finalize_sync_log(sync_log_id, ctx)
