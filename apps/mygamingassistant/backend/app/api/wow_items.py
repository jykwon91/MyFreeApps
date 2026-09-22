"""WoW Forever item reader — operator-only (each call spends Claude API money).

Routes (all behind ``current_active_user`` at router level):
    POST /api/wow/items/extract — multipart: ``image`` (png/jpeg/webp) OR ``text``

Returns the parsed item; nothing is persisted. Scoring is deterministic frontend
code (``frontend/src/games/wow-forever/scoring``), so the public site can still
compare items entered by hand or parsed from pasted text without this route.
Serve-only deployments don't mount this router at all (it is registered in
``_mount_auth_routes``).
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.auth import current_active_user
from app.core.config import settings
from app.core.rate_limit import RateLimiter
from app.models.user.user import User
from app.schemas.wow.extracted_item import ItemExtractionResponse
from app.services.wow import item_extractor
from app.services.wow.item_extraction_errors import (
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

router = APIRouter(
    prefix="/wow/items",
    tags=["wow"],
    dependencies=[Depends(current_active_user)],
)

item_extract_limiter = RateLimiter(
    max_attempts=settings.item_extract_rate_limit_threshold,
    window_seconds=settings.item_extract_rate_limit_window_seconds,
)

# (status, user-facing message). Input errors reuse the service's own message.
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
    ItemExtractionNotConfiguredError: (
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Screenshot reading isn't set up on this server. Paste the tooltip text or enter stats by hand.",
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
    user: User = Depends(current_active_user),
) -> ItemExtractionResponse:
    """Read one tooltip. Exactly one of ``image`` / ``text`` must be sent."""
    item_extract_limiter.check(f"wow-item-extract:{user.id}")
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
