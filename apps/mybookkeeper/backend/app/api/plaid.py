"""HTTP routes for Plaid bank sync.

Route prefix: /plaid. Everything is the signed-in person's own connections,
except the webhook, which is public and authenticated by Plaid's signed JWT.

Writes refuse demo workspaces: a demo must never hold a real bank login.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.core.rate_limit import RateLimiter
from app.core.request_utils import get_client_ip
from app.schemas.plaid.plaid_item_create_request import PlaidItemCreateRequest
from app.schemas.plaid.plaid_item_response import PlaidItemResponse
from app.schemas.plaid.plaid_link_token_request import PlaidLinkTokenRequest
from app.schemas.plaid.plaid_link_token_response import PlaidLinkTokenResponse
from app.schemas.plaid.plaid_sync_result import PlaidSyncResult
from app.services.plaid import (
    plaid_item_service,
    plaid_sync_service,
    plaid_webhook_service,
    plaid_webhook_verifier,
)
from app.services.plaid.invalid_plaid_connection_error import InvalidPlaidConnectionError
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError
from app.services.plaid.plaid_login_required_error import PlaidLoginRequiredError
from app.services.plaid.plaid_webhook_verification_error import PlaidWebhookVerificationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plaid", tags=["plaid"])

_NOT_FOUND = "Bank connection not found"
_NOT_CONFIGURED = "Bank sync isn't set up on this server"
_PLAID_UNAVAILABLE = "The bank connection service didn't answer. Try again in a minute."
_LOGIN_REQUIRED = "login_required"
# Plaid sends a handful of webhooks per item per day; this only stops floods.
_webhook_limiter = RateLimiter(max_attempts=120, window_seconds=60)
# "Sync now" calls Plaid each time.
_sync_limiter = RateLimiter(max_attempts=30, window_seconds=3600)


def _plaid_failure() -> HTTPException:
    # Plaid's codes are logged by the client; the person gets plain words.
    return HTTPException(status_code=502, detail=_PLAID_UNAVAILABLE)


@router.post("/link-token", response_model=PlaidLinkTokenResponse)
async def create_link_token(
    payload: PlaidLinkTokenRequest,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> PlaidLinkTokenResponse:
    try:
        return await plaid_item_service.create_link_token(
            user_id=ctx.user_id, organization_id=ctx.organization_id, item_id=payload.item_id,
        )
    except PlaidItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND) from exc
    except PlaidNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc
    except PlaidApiError as exc:
        raise _plaid_failure() from exc


@router.get("/items", response_model=list[PlaidItemResponse])
async def list_items(ctx: RequestContext = Depends(current_org_member)) -> list[PlaidItemResponse]:
    return await plaid_item_service.list_items(
        user_id=ctx.user_id, organization_id=ctx.organization_id,
    )


@router.post("/items", response_model=PlaidItemResponse, status_code=201)
async def connect_item(
    payload: PlaidItemCreateRequest,
    background_tasks: BackgroundTasks,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> PlaidItemResponse:
    try:
        item = await plaid_item_service.connect(
            user_id=ctx.user_id, organization_id=ctx.organization_id, payload=payload,
        )
    except InvalidPlaidConnectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PlaidNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc
    except PlaidApiError as exc:
        raise _plaid_failure() from exc
    # The first sync pulls up to two years of history; it runs after the
    # response so the page isn't held while it does.
    background_tasks.add_task(plaid_sync_service.sync_item_in_background, item.id)
    return item


@router.post("/items/{item_id}/sync", response_model=PlaidSyncResult)
async def sync_item(
    item_id: uuid.UUID,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> PlaidSyncResult:
    _sync_limiter.check(f"plaid-sync:{ctx.user_id}")
    try:
        return await plaid_sync_service.sync_for_user(
            item_id=item_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except PlaidItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND) from exc
    except PlaidLoginRequiredError as exc:
        raise HTTPException(status_code=409, detail=_LOGIN_REQUIRED) from exc
    except PlaidNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc


@router.post("/items/{item_id}/reconnected", response_model=PlaidItemResponse)
async def mark_reconnected(
    item_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> PlaidItemResponse:
    try:
        item = await plaid_item_service.mark_reconnected(
            item_id=item_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except PlaidItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND) from exc
    background_tasks.add_task(plaid_sync_service.sync_item_in_background, item.id)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def disconnect_item(
    item_id: uuid.UUID,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> Response:
    try:
        await plaid_item_service.disconnect(
            item_id=item_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except PlaidItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND) from exc
    except PlaidNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc
    except PlaidApiError as exc:
        raise _plaid_failure() from exc
    return Response(status_code=204)


@router.post("/webhook", status_code=200)
async def plaid_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    plaid_verification: str | None = Header(default=None, alias="Plaid-Verification"),
) -> Response:
    """Webhooks from Plaid. Public; authenticated by Plaid's signed JWT over
    the exact body bytes."""
    _webhook_limiter.check(f"plaid-webhook:{get_client_ip(request)}")
    body = await request.body()
    try:
        await plaid_webhook_verifier.verify(body, plaid_verification)
    except PlaidWebhookVerificationError as exc:
        logger.warning("Rejected Plaid webhook: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature") from exc
    except PlaidNotConfiguredError as exc:
        logger.error("Plaid webhook received but Plaid is not configured")
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc
    item_id = await plaid_webhook_service.handle(body)
    if item_id is not None:
        background_tasks.add_task(plaid_sync_service.sync_item_in_background, item_id)
    return Response(status_code=200)
