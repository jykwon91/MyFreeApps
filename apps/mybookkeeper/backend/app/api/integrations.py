import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.models.responses.connect_response import ConnectResponse
from app.models.responses.extract_response import ExtractResponse
from app.models.responses.integration_response import IntegrationResponse
from app.models.responses.queue_item_response import QueueItemResponse
from app.models.responses.retry_all_response import RetryAllResponse
from app.models.responses.retry_response import RetryResponse
from app.models.responses.sync_log_response import SyncLogResponse
from app.schemas.integrations.gmail_sync_response import GmailSyncResponse
from app.services.integrations import integration_service
from app.services.email.email_processor_service import discover_gmail_emails, drain_gmail_fetch, drain_claude_extraction, finalize_sync_log

router = APIRouter(prefix="/integrations", tags=["integrations"])
logger = logging.getLogger(__name__)


class CancelSyncRequest(BaseModel):
    sync_log_id: int | None = None

_background_tasks: set[asyncio.Task[None]] = set()


@router.get("/gmail/connect")
async def connect_gmail(
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> ConnectResponse:
    auth_url = integration_service.get_gmail_connect_url(ctx)
    return ConnectResponse(auth_url=auth_url)


@router.get("/gmail/callback")
async def gmail_callback(
    code: str,
    state: str,
) -> RedirectResponse:
    try:
        await integration_service.handle_gmail_callback(code, state)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return RedirectResponse(url=f"{settings.frontend_url}/oauth-callback")


@router.get("")
async def list_integrations(
    ctx: RequestContext = Depends(current_org_member),
) -> list[IntegrationResponse]:
    items = await integration_service.list_integrations(ctx)
    return [IntegrationResponse(**i) for i in items]


@router.post("/gmail/sync")
async def sync_gmail(
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> GmailSyncResponse:
    running = await integration_service.check_sync_running(ctx)
    if running:
        raise HTTPException(status_code=409, detail="Sync already in progress")

    result = await discover_gmail_emails(ctx)
    sync_log_id: int | None = result.sync_log_id

    async def _fetch_then_extract(context: RequestContext) -> None:
        try:
            await drain_gmail_fetch(context, sync_log_id=sync_log_id)
            await drain_claude_extraction(context, sync_log_id=sync_log_id)
            if sync_log_id is not None:
                await finalize_sync_log(sync_log_id, context)
        except Exception:
            logger.exception(
                "Background gmail sync failed for user=%s org=%s",
                context.user_id, context.organization_id,
            )

    task = asyncio.create_task(_fetch_then_extract(ctx))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return GmailSyncResponse(**result.to_dict())


@router.post("/gmail/sync/cancel", status_code=204)
async def cancel_gmail_sync(
    body: CancelSyncRequest | None = None,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    sync_log_id = body.sync_log_id if body else None
    await integration_service.cancel_gmail_sync(ctx, sync_log_id=sync_log_id)


@router.post("/gmail/extract")
async def extract_gmail(
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> ExtractResponse:
    count = await integration_service.start_extraction(ctx)
    if not count:
        return ExtractResponse(count=0)

    async def _extract(context: RequestContext) -> None:
        try:
            await drain_claude_extraction(context)
        except Exception:
            logger.exception(
                "Background extraction failed for user=%s org=%s",
                context.user_id, context.organization_id,
            )

    task = asyncio.create_task(_extract(ctx))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return ExtractResponse(count=count)


@router.get("/gmail/queue")
async def get_email_queue(
    ctx: RequestContext = Depends(current_org_member),
) -> list[QueueItemResponse]:
    items = await integration_service.get_queue_items(ctx)
    return [QueueItemResponse(**i) for i in items]


@router.delete("/gmail/queue/{item_id}", status_code=204)
async def dismiss_queue_item(
    item_id: UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    dismissed = await integration_service.dismiss_queue_item(ctx, item_id)
    if not dismissed:
        raise HTTPException(status_code=404, detail="Queue item not found")


@router.post("/gmail/queue/{item_id}/retry")
async def retry_queue_item(
    item_id: UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> RetryResponse:
    try:
        result = await integration_service.retry_queue_item(ctx, item_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return RetryResponse(**result)


@router.post("/gmail/queue/retry-all")
async def retry_all_failed(
    ctx: RequestContext = Depends(require_write_access),
) -> RetryAllResponse:
    await integration_service.retry_all_failed(ctx)
    return RetryAllResponse(status="ok")


@router.get("/gmail/logs")
async def gmail_sync_logs(
    ctx: RequestContext = Depends(current_org_member),
) -> list[SyncLogResponse]:
    items = await integration_service.get_sync_logs(ctx)
    return [SyncLogResponse(**i) for i in items]


@router.delete("/gmail", status_code=204)
async def disconnect_gmail(
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    disconnected = await integration_service.disconnect_gmail(ctx)
    if not disconnected:
        raise HTTPException(status_code=404, detail="Gmail not connected")
