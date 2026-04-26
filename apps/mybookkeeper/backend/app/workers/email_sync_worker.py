import logging
import uuid

from app.core.context import worker_context
from app.db.session import AsyncSessionLocal
from app.repositories import organization_repo
from app.services.email.email_processor_service import discover_gmail_emails, drain_gmail_fetch, drain_claude_extraction, finalize_sync_log
from app.services.email.exceptions import GmailAuthExpiredError

logger = logging.getLogger(__name__)


async def sync_gmail_for_user(user_id: str) -> None:
    """Full pipeline: discover emails, fetch bytes, then extract with Claude.

    The scheduler passes user_id. We look up the user's org membership
    to derive organization context for the org-scoped service layer.

    A GmailAuthExpiredError means the user's refresh token has been
    invalidated by Google (password change, revoke, or test-app expiry).
    The discovery service already records a failed sync_log row; the worker
    logs a warning and returns cleanly so the scheduler loop keeps running
    for other users.
    """
    uid = uuid.UUID(user_id)
    async with AsyncSessionLocal() as db:
        memberships = await organization_repo.list_for_user(db, uid)
        if not memberships:
            logger.warning("User %s has no org memberships -- skipping Gmail sync", uid)
            return
        ctx = worker_context(memberships[0].organization_id, uid)

    try:
        result = await discover_gmail_emails(ctx)
    except GmailAuthExpiredError:
        logger.warning(
            "Gmail auth expired for user=%s org=%s -- user must reconnect",
            uid, ctx.organization_id,
        )
        return

    sync_log_id = result.sync_log_id
    await drain_gmail_fetch(ctx, sync_log_id=sync_log_id)
    await drain_claude_extraction(ctx, sync_log_id=sync_log_id)
    if sync_log_id is not None:
        await finalize_sync_log(sync_log_id, ctx)
