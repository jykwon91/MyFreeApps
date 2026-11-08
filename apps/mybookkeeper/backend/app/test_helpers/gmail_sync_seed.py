"""Test-only Gmail sync seed: a sync session and its queue items in known states.

A real sync needs Google, which the E2E stack can't reach, so nothing else can
give an organization sync history or queue items to show, retry or extract.
"""

import datetime as _dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories.email import email_queue_repo, sync_log_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedQueueItem(BaseModel):
    model_config = {"extra": "forbid"}

    email_subject: str = Field(min_length=1, max_length=500)
    attachment_filename: str | None = Field(default=None, max_length=500)
    status: Literal["pending", "fetched", "done", "failed", "skipped"]
    error: str | None = Field(default=None, max_length=1000)


class _SeedGmailSyncRequest(BaseModel):
    model_config = {"extra": "forbid"}

    status: Literal["running", "success", "failed", "partial", "cancelled"]
    records_added: int = Field(default=0, ge=0)
    queue: list[_SeedQueueItem] = Field(default_factory=list)


class _SeededGmailSync(BaseModel):
    sync_log_id: int
    queue_item_ids: list[uuid.UUID]


@router.post("/test/seed-gmail-sync", status_code=201)
async def seed_gmail_sync(
    payload: _SeedGmailSyncRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeededGmailSync:
    """Add one Gmail sync session, with its queue items, to my organization."""
    _require_test_mode()
    now = _dt.datetime.now(_dt.timezone.utc)
    async with unit_of_work() as db:
        log = await sync_log_repo.create(
            db, ctx.organization_id, ctx.user_id, "gmail", payload.status,
            records_added=payload.records_added,
            started_at=now,
            completed_at=None if payload.status == "running" else now,
        )
        items = [
            await email_queue_repo.create_item(
                db,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                sync_log_id=log.id,
                message_id=f"e2e-{uuid.uuid4()}",
                attachment_filename=item.attachment_filename,
                email_subject=item.email_subject,
                status=item.status,
                error=item.error,
            )
            for item in payload.queue
        ]
        return _SeededGmailSync(sync_log_id=log.id, queue_item_ids=[i.id for i in items])
