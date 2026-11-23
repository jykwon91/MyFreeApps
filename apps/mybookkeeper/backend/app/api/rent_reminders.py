"""HTTP routes for tenant rent reminders.

Route prefix: /rent-reminders. Everything is organization-scoped except the
two Twilio webhooks (status callbacks, and texts tenants send back), which are
public and authenticated by the ``X-Twilio-Signature`` Twilio puts on every
request.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from platform_shared.core.sms_constants import (
    TWILIO_EMPTY_TWIML,
    TWILIO_SIGNATURE_HEADER,
    TWILIO_TWIML_MEDIA_TYPE,
)
from platform_shared.services.twilio_webhook import (
    TwilioWebhookAuthError,
    check_twilio_callback_headers,
)

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write
from app.core.rate_limit import RateLimiter
from app.core.rent_reminder_constants import (
    REMINDER_MAY_HAVE_BEEN_SENT_CODE,
    SEND_NOW_RATE_LIMIT,
    SEND_NOW_RATE_WINDOW_SECONDS,
    SMS_WEBHOOK_RATE_LIMIT,
    SMS_WEBHOOK_RATE_WINDOW_SECONDS,
    SMS_WEBHOOK_REQUEST_ID_PARAM,
)
from app.core.request_utils import get_client_ip
from app.core.twilio_request_verifier import TwilioRequestVerifier
from app.schemas.rent.rent_reminder_overview_response import RentReminderOverviewResponse
from app.schemas.rent.rent_reminder_plan_request import RentReminderPlanRequest
from app.schemas.rent.rent_reminder_plan_response import RentReminderPlanResponse
from app.schemas.rent.rent_reminder_preview_response import RentReminderPreviewResponse
from app.schemas.rent.rent_reminder_send_now_request import RentReminderSendNowRequest
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.services.rent import (
    rent_reminder_dispatch_service,
    rent_reminder_reply_service,
    rent_reminder_service,
    rent_reminder_webhook_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rent-reminders", tags=["rent-reminders"])

_TENANT_NOT_FOUND = "Tenant not found"
_PLAN_NOT_FOUND = "This tenant has no rent reminder plan"
_INVALID_WEBHOOK_SIGNATURE = "Invalid webhook signature"
# Twilio sends a handful of status callbacks per text; these only stop floods.
_webhook_limiter = RateLimiter(
    max_attempts=SMS_WEBHOOK_RATE_LIMIT, window_seconds=SMS_WEBHOOK_RATE_WINDOW_SECONDS,
)
_inbound_limiter = RateLimiter(
    max_attempts=SMS_WEBHOOK_RATE_LIMIT, window_seconds=SMS_WEBHOOK_RATE_WINDOW_SECONDS,
)
_send_now_limiter = RateLimiter(
    max_attempts=SEND_NOW_RATE_LIMIT, window_seconds=SEND_NOW_RATE_WINDOW_SECONDS,
)


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
    except (
        rent_reminder_service.SmsUnavailableError,
        rent_reminder_service.SmsNotAllowedError,
    ) as exc:
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
    except (
        rent_reminder_service.SmsUnavailableError,
        rent_reminder_service.SmsNotAllowedError,
    ) as exc:
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
    body: RentReminderSendNowRequest,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> list[RentReminderSendResponse]:
    """Send the next reminder now on every enabled channel — always together."""
    _send_now_limiter.check(f"rent-reminder-send:{ctx.user_id}")
    try:
        return await rent_reminder_dispatch_service.send_now(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            expected_due_date=body.due_date,
            expected_amount=body.amount,
            expected_message=body.message,
            expected_channels=body.channels,
            confirmed_possibly_sent=body.confirmed_possibly_sent,
        )
    except rent_reminder_service.TenantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TENANT_NOT_FOUND) from exc
    except rent_reminder_service.PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_PLAN_NOT_FOUND) from exc
    except (
        rent_reminder_service.SmsUnavailableError,
        rent_reminder_service.SmsNotAllowedError,
        rent_reminder_dispatch_service.NoUpcomingRentError,
        rent_reminder_dispatch_service.TenancyEndedError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except rent_reminder_dispatch_service.ReminderAlreadySentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except rent_reminder_dispatch_service.ReminderMayHaveBeenSentError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": REMINDER_MAY_HAVE_BEEN_SENT_CODE, "message": str(exc)},
        ) from exc
    except rent_reminder_dispatch_service.ReminderChangedError as exc:
        raise HTTPException(status_code=412, detail=str(exc)) from exc


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


async def _signed_twilio_params(
    request: Request, verify: TwilioRequestVerifier, *, what: str,
) -> dict[str, str]:
    """The form parameters of a webhook request Twilio signed, or 403.

    A request without a signature, or with a body Twilio never sends, is
    refused before the body is read. The signature covers the URL and every
    form parameter, so the same parameters that were checked are the ones
    acted on.
    """
    signature = request.headers.get(TWILIO_SIGNATURE_HEADER)
    try:
        check_twilio_callback_headers(
            signature=signature, content_type=request.headers.get("content-type"),
        )
        form = await request.form()
        params = {key: value for key, value in form.items() if isinstance(value, str)}
        verify(query_string=request.url.query, params=params, signature=signature)
    except TwilioWebhookAuthError as exc:
        logger.warning("Rejected Twilio %s: %s", what, exc)
        raise HTTPException(status_code=403, detail=_INVALID_WEBHOOK_SIGNATURE) from exc
    return params


@router.post("/sms/webhook", status_code=204)
async def sms_webhook(request: Request) -> Response:
    """Twilio status callbacks (form-encoded). Public; authenticated by Twilio's signature."""
    _webhook_limiter.check(f"twilio-webhook:{get_client_ip(request)}")
    params = await _signed_twilio_params(
        request, rent_reminder_webhook_service.verify, what="status callback",
    )
    await rent_reminder_webhook_service.handle_event(
        params,
        request_id=request.query_params.get(SMS_WEBHOOK_REQUEST_ID_PARAM),
    )
    return Response(status_code=204)


@router.post("/sms/inbound", response_class=Response)
async def sms_inbound(request: Request) -> Response:
    """Texts sent to the reminder number (Twilio's "A message comes in" webhook). Public;
    authenticated by Twilio's signature.

    Every accepted text gets an empty TwiML answer, so Twilio texts nothing back
    to the tenant and logs no error. Replies are emailed to the landlord after
    the answer, by ``rent_reminder_reply_service``.
    """
    _inbound_limiter.check(f"twilio-inbound:{get_client_ip(request)}")
    params = await _signed_twilio_params(
        request, rent_reminder_reply_service.verify, what="inbound message",
    )
    await rent_reminder_reply_service.handle_message(params)
    return Response(content=TWILIO_EMPTY_TWIML, media_type=TWILIO_TWIML_MEDIA_TYPE)
