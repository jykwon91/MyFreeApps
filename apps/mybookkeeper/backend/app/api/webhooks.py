"""Webhook endpoints — verified via Plaid JWKS signature."""
import json
import logging

from fastapi import APIRouter, Request, Response

from app.core.plaid_webhook_verifier import verify_plaid_webhook
from app.core.rate_limit import RateLimiter
from app.services.integrations.plaid_webhook_service import handle_plaid_webhook

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

_MAX_BODY_SIZE = 1_048_576  # 1 MB
_webhook_limiter = RateLimiter(max_attempts=60, window_seconds=60)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/plaid")
async def plaid_webhook(request: Request) -> Response:
    """Handle Plaid webhook notifications with signature verification."""
    try:
        _webhook_limiter.check(_get_client_ip(request))
    except Exception:
        return Response(
            content='{"status":"ok"}',
            media_type="application/json",
            status_code=200,
        )

    raw_body = await request.body()
    if len(raw_body) > _MAX_BODY_SIZE:
        return Response(
            content='{"status":"ok"}',
            media_type="application/json",
            status_code=200,
        )

    verification_header = request.headers.get("plaid-verification")
    if not await verify_plaid_webhook(verification_header, raw_body):
        logger.warning("Plaid webhook verification failed")
        return Response(
            content='{"status":"ok"}',
            media_type="application/json",
            status_code=200,
        )

    try:
        body = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return Response(
            content='{"status":"ok"}',
            media_type="application/json",
            status_code=200,
        )

    await handle_plaid_webhook(body)

    return Response(
        content='{"status":"ok"}',
        media_type="application/json",
        status_code=200,
    )
