import logging
import uuid

from app.core.context import worker_context
from app.db.session import AsyncSessionLocal
from app.repositories import organization_repo
from app.services.email.email_processor_service import discover_gmail_emails, drain_gmail_fetch, drain_claude_extraction, finalize_sync_log

logger = logging.getLogger(__name__)


async def sync_gmail_for_user(user_id: str) -> None:
    """Full pipeline: discover emails, fetch bytes, then extract with Claude.

    The scheduler passes user_id. We look up the user's org membership
    to derive organization context for the org-scoped service layer.
    """
    uid = uuid.UUID(user_id)
    async with AsyncSessionLocal() as db:
        memberships = await organization_repo.list_for_user(db, uid)
        if not memberships:
            logger.warning("User %s has no org memberships -- skipping Gmail sync", uid)
            return
        ctx = worker_context(memberships[0].organization_id, uid)

    result = await discover_gmail_emails(ctx)
    sync_log_id = result.sync_log_id
    await drain_gmail_fetch(ctx, sync_log_id=sync_log_id)
    await drain_claude_extraction(ctx, sync_log_id=sync_log_id)
    if sync_log_id is not None:
        await finalize_sync_log(sync_log_id, ctx)
