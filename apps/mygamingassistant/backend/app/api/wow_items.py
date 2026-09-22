"""WoW Forever item reader — PUBLIC, mounted in both serve-only and full-auth mode.

Routes:
    POST /api/wow/items/extract — multipart: ``image`` (png/jpeg/webp) OR ``text``

Returns the parsed item; nothing about it is persisted. Scoring is deterministic
frontend code (``frontend/src/games/wow-forever/scoring``), so the compare page
works without this route — it only saves the user typing stats.

Every call spends Claude API money and there is no login in serve-only prod,
so the router gates each request, cheapest check first:

1. ``require_item_reader_available`` — 503 ``item_reader_unavailable`` when the
   reader is switched off: no ANTHROPIC_API_KEY, WOW_EXTRACT_DAILY_CAP <= 0, or
   (serve-only / production) no TURNSTILE_SECRET_KEY. Deliberately a runtime
   503, not a boot guard — the site boots and the UI falls back to manual entry.
2. ``check_item_reader_ip_limit`` — per-IP in-process limit (429).
3. ``require_turnstile`` — the shared platform_shared Turnstile dependency
   (400 missing / ``captcha_expired_please_retry`` / ``captcha_verification_failed``;
   503 ``captcha_service_misconfigured`` + ERROR log on a bad secret).
4. The service validates input, then consumes one unit of the durable global
   daily cap (429 ``item_reader_daily_limit_reached``), then calls Claude.
"""
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from platform_shared.core.request_utils import get_client_ip

from app.core.config import settings
from app.core.rate_limit import RateLimiter, require_turnstile
from app.schemas.wow.extracted_item import ItemExtractionResponse
from app.services.wow import item_extractor
from app.services.wow.item_extraction_errors import (
    ItemExtractionDailyCapError,
    ItemExtractionError,
    ItemExtractionInputError,
    ItemExtractionMisconfiguredError,
    ItemExtractionNotConfiguredError,
    ItemExtractionRateLimitedError,
    ItemExtractionTooLargeError,
    ItemExtractionUnreadableError,
    ItemExtractionUpstreamError,
    NotAnItemTooltipError,
)

logger = logging.getLogger(__name__)

# Machine-readable details the frontend maps to its manual-entry fallback copy.
ITEM_READER_UNAVAILABLE = "item_reader_unavailable"
ITEM_READER_DAILY_LIMIT_REACHED = "item_reader_daily_limit_reached"

item_extract_limiter = RateLimiter(
    max_attempts=settings.item_extract_rate_limit_threshold,
    window_seconds=settings.item_extract_rate_limit_window_seconds,
)


def _turnstile_required() -> bool:
    """Anonymous deployments must not expose a paid endpoint without a CAPTCHA."""
    return settings.serve_only or settings.environment == "production"


async def require_item_reader_available() -> None:
    missing: list[str] = []
    if not settings.anthropic_api_key:
        missing.append("ANTHROPIC_API_KEY")
    if settings.wow_extract_daily_cap <= 0:
        missing.append("WOW_EXTRACT_DAILY_CAP")
    if _turnstile_required() and not settings.turnstile_secret_key:
        missing.append("TURNSTILE_SECRET_KEY")
    if missing:
        logger.warning("wow item extract unavailable: not configured: %s", ",".join(missing))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=ITEM_READER_UNAVAILABLE)


async def check_item_reader_ip_limit(request: Request) -> None:
    item_extract_limiter.check(f"wow-item-extract:{get_client_ip(request)}")


router = APIRouter(
    prefix="/wow/items",
    tags=["wow"],
    # Order matters — FastAPI resolves these sequentially.
    dependencies=[
        Depends(require_item_reader_available),
        Depends(check_item_reader_ip_limit),
        Depends(require_turnstile),
    ],
)

# (status, user-facing detail). Input errors reuse the service's own message.
_ERROR_RESPONSES: dict[type[ItemExtractionError], tuple[int, str | None]] = {
    ItemExtractionInputError: (status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    ItemExtractionTooLargeError: (
        status.HTTP_413_CONTENT_TOO_LARGE,
        "That screenshot is too large — crop it to the tooltip (5 MB max).",
    ),
    NotAnItemTooltipError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "That doesn't look like a WoW item tooltip. Try a tighter crop of the tooltip.",
    ),
    ItemExtractionUnreadableError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "The item reader couldn't read that. Try a clearer screenshot or paste the text.",
    ),
    ItemExtractionRateLimitedError: (
        status.HTTP_429_TOO_MANY_REQUESTS,
        "The item reader is busy right now. Wait a minute and try again.",
    ),
    ItemExtractionDailyCapError: (
        status.HTTP_429_TOO_MANY_REQUESTS,
        ITEM_READER_DAILY_LIMIT_REACHED,
    ),
    ItemExtractionNotConfiguredError: (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        ITEM_READER_UNAVAILABLE,
    ),
    ItemExtractionMisconfiguredError: (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Screenshot reading is misconfigured on this server. Enter stats by hand for now.",
    ),
    ItemExtractionUpstreamError: (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "The item reader is temporarily unavailable. Try again shortly.",
    ),
}


@router.post("/extract", response_model=ItemExtractionResponse)
async def extract_item(
    image: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
) -> ItemExtractionResponse:
    """Read one tooltip. Exactly one of ``image`` / ``text`` must be sent."""
    # Read one byte past the cap so an oversized upload is detected without
    # buffering all of it.
    image_bytes: bytes | None = None
    if image is not None:
        image_bytes = await image.read(settings.item_extract_max_image_bytes + 1)
    try:
        return await item_extractor.extract_item(image=image_bytes, text=text)
    except ItemExtractionError as exc:
        status_code, message = _ERROR_RESPONSES.get(
            type(exc), (status.HTTP_502_BAD_GATEWAY, "The item reader failed.")
        )
        raise HTTPException(status_code=status_code, detail=message or str(exc)) from exc
