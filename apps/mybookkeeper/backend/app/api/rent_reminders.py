"""HTTP routes for tenant rent reminders.

Route prefix: /rent-reminders. Everything is organization-scoped except the
httpSMS webhook, which is public and authenticated by the signed JWT httpSMS
attaches to every delivery report.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request, Response
from platform_shared.services.httpsms_service import HttpSmsWebhookAuthError

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write
from app.core.rate_limit import RateLimiter
from app.core.request_utils import get_client_ip
from app.schemas.rent.rent_reminder_overview_response import RentReminderOverviewResponse
from app.schemas.rent.rent_reminder_plan_request import RentReminderPlanRequest
from app.schemas.rent.rent_reminder_plan_response import RentReminderPlanResponse
from app.schemas.rent.rent_reminder_preview_response import RentReminderPreviewResponse
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.services.rent import (
    rent_reminder_dispatch_service,
    rent_reminder_service,
    rent_reminder_webhook_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rent-reminders", tags=["rent-reminders"])

_TENANT_NOT_FOUND = "Tenant not found"
_PLAN_NOT_FOUND = "This tenant has no rent reminder plan"
# httpSMS sends a handful of events per text; this only stops floods.
_webhook_limiter = RateLimiter(max_attempts=120, window_seconds=60)
_send_now_limiter = RateLimiter(max_attempts=20, window_seconds=3600)


@router.get("/tenants/{applicant_id}", response_model=RentReminderOverviewResponse)
async def get_overview(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> RentReminderOverviewResponse:
    try:
        return await rent_reminder_service.get_overview(
            organization_id=ctx.organization_id, user_id=ctx.user_id, applicant_id=applicant_id,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc


@router.post(
    "/tenants/{applicant_id}/plan",
    response_model=RentReminderPlanResponse,
    status_code=201,
)
async def create_plan(
    applicant_id: uuid.UUID,
    payload: RentReminderPlanRequest,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> RentReminderPlanResponse:
    try:
        return await rent_reminder_service.create_plan(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            payload=payload,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except rent_reminder_service.SmsUnavailableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/tenants/{applicant_id}/plan", response_model=RentReminderPlanResponse)
async def update_plan(
    applicant_id: uuid.UUID,
    payload: RentReminderPlanRequest,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> RentReminderPlanResponse:
    try:
        return await rent_reminder_service.update_plan(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            payload=payload,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_PLAN_NOT_FOUND) from exc
    except rent_reminder_service.SmsUnavailableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/tenants/{applicant_id}/plan", status_code=204)
async def delete_plan(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> Response:
    try:
        await rent_reminder_service.delete_plan(
            organization_id=ctx.organization_id, user_id=ctx.user_id, applicant_id=applicant_id,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_PLAN_NOT_FOUND) from exc
    return Response(status_code=204)


@router.get(
    "/tenants/{applicant_id}/preview",
    response_model=RentReminderPreviewResponse | None,
)
async def get_preview(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> RentReminderPreviewResponse | None:
    """The next reminder, or ``null`` when there is no upcoming rent to remind about."""
    try:
        return await rent_reminder_service.get_preview(
            organization_id=ctx.organization_id, user_id=ctx.user_id, applicant_id=applicant_id,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_PLAN_NOT_FOUND) from exc


@router.post(
    "/tenants/{applicant_id}/send-now",
    response_model=list[RentReminderSendResponse],
)
async def send_now(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> list[RentReminderSendResponse]:
    """Send the next reminder now on every enabled channel — always together."""
    _send_now_limiter.check(f"rent-reminder-send:{ctx.user_id}")
    try:
        return await rent_reminder_dispatch_service.send_now(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_PLAN_NOT_FOUND) from exc
    except (
        rent_reminder_service.SmsUnavailableError,
        rent_reminder_dispatch_service.NoUpcomingRentError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except rent_reminder_dispatch_service.ReminderAlreadySentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/tenants/{applicant_id}/sends",
    response_model=list[RentReminderSendResponse],
)
async def list_sends(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[RentReminderSendResponse]:
    try:
        return await rent_reminder_service.list_history(
            organization_id=ctx.organization_id, user_id=ctx.user_id, applicant_id=applicant_id,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc


@router.post("/sms/webhook", status_code=204)
async def sms_webhook(
    request: Request,
    payload: dict[str, Any] = Body(...),
    authorization: str | None = Header(default=None),
    x_event_type: str | None = Header(default=None),
) -> Response:
    """Delivery reports from httpSMS. Public; authenticated by its signed JWT."""
    _webhook_limiter.check(f"httpsms-webhook:{get_client_ip(request)}")
    try:
        rent_reminder_webhook_service.verify(authorization)
    except HttpSmsWebhookAuthError as exc:
        logger.warning("Rejected httpSMS webhook: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature") from exc
    await rent_reminder_webhook_service.handle_event(payload, event_type_header=x_event_type)
    return Response(status_code=204)
