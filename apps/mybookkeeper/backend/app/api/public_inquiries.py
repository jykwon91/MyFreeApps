"""Public, unauthenticated routes for the inquiry-form flow (T0).

Exposes:
- ``GET /api/listings/public/{slug}`` — fetches the strict subset of listing
  data needed to render the form's header.
- ``POST /api/inquiries/public`` — accepts a public inquiry submission, runs
  the 11-step spam filter pipeline, and returns a generic 200/400/429.

These routes are mounted WITHOUT the authenticated ``RequireAuth`` /
``current_org_member`` dependencies — they're the only path in MBK that
doesn't require a logged-in user. Defense-in-depth lives in the service layer
(rate limit, Turnstile, honeypot, Claude scoring).
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.core.config import settings
from app.core.rate_limit import RateLimiter
from app.core.request_utils import get_client_ip
from app.schemas.inquiries.public_inquiry_request import (
    PublicInquiryRequest,
)
from app.schemas.listings.public_listing_response import PublicListingResponse
from app.db.session import AsyncSessionLocal
from app.repositories.listings import listing_repo
from app.services.inquiries import public_inquiry_service
from app.services.inquiries.public_inquiry_service import PublicInquiryOutcome
from app.services.system.inquiry_notification_email import (
    send_inquiry_notification,
)
from platform_shared.services.turnstile_service import verify_turnstile_token

# Per-IP submission rate limiter — independent of the login limiter so a
# spammer can't exhaust their IP's login budget by hammering the public form
# (and vice versa). Configured from MBK settings so the operator can tune it.
public_inquiry_limiter = RateLimiter(
    max_attempts=settings.inquiry_public_rate_limit_max,
    window_seconds=settings.inquiry_public_rate_limit_window_seconds,
)

# Generic message returned on EVERY filter failure except the friendly
# "tell us more" gate. Keeps anti-spam intel out of the response so an
# attacker probing the form can't tell which check tripped.
_GENERIC_REJECTION = "Something went wrong, please try again."

router = APIRouter(prefix="/api", tags=["public-inquiries"])


@router.get("/listings/public/{slug}", response_model=PublicListingResponse)
async def get_public_listing(slug: str) -> PublicListingResponse:
    """Public listing lookup for the inquiry form header.

    Anyone with the slug can read the basic listing fields. Returns 404 for
    unknown / soft-deleted slugs — operators rotate slugs by archiving the
    listing, which automatically takes the form down.
    """
    async with AsyncSessionLocal() as db:
        listing = await listing_repo.get_by_slug(db, slug)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return PublicListingResponse.model_validate(listing)


@router.post("/inquiries/public", status_code=200)
async def submit_public_inquiry(
    payload: PublicInquiryRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Public inquiry form submission — runs the 11-step pipeline.

    Always returns ``{"status": "received"}`` on success — even if a hard
    spam gate fired (honeypot, disposable email) — so bots can't tell they
    were caught. Real failures map to a generic 400; the only friendly error
    is the soft "tell us more" gate.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")[:500] or None

    # Step 1: per-IP rate limit (raises 429 internally).
    try:
        public_inquiry_limiter.check(client_ip or "unknown")
        rate_limited = False
    except HTTPException:
        # Re-raise as the same 429 — the body is already the shared generic.
        raise

    # Step 2: Turnstile (no-op when secret is empty).
    turnstile_passed = await verify_turnstile_token(
        payload.turnstile_token,
        client_ip,
        secret_key=settings.turnstile_secret_key,
    )
    # Don't reject on turnstile fail here — let the pipeline log the
    # assessment row + flip spam_status. The bot still sees a 200 success.

    # Steps 3-11 happen in the service.
    result = await public_inquiry_service.submit_public_inquiry(
        payload=payload,
        client_ip=client_ip,
        user_agent=user_agent,
        turnstile_passed=turnstile_passed,
        rate_limited=rate_limited,
    )

    if result.outcome == PublicInquiryOutcome.LISTING_NOT_FOUND:
        raise HTTPException(status_code=404, detail="Listing not found")
    if result.outcome == PublicInquiryOutcome.NEEDS_MORE_DETAIL:
        # Soft gate — friendly hint so legitimate users can fix and resubmit.
        from app.schemas.inquiries.public_inquiry_request import (
            PUBLIC_INQUIRY_FRIENDLY_ERROR_TELL_MORE,
        )
        raise HTTPException(
            status_code=400,
            detail=PUBLIC_INQUIRY_FRIENDLY_ERROR_TELL_MORE,
        )
    if result.outcome == PublicInquiryOutcome.INVALID:
        raise HTTPException(status_code=400, detail=_GENERIC_REJECTION)

    # SUCCESS path. Schedule operator notification for clean / flagged
    # results in a background task so the HTTP response is fast.
    if result.notify_operator and result.inquiry_id is not None:
        background_tasks.add_task(
            send_inquiry_notification,
            inquiry_id=result.inquiry_id,
            subject_prefix=result.notify_subject_prefix,
        )

    return {"status": "received"}
