"""WoW Forever feature requests — PUBLIC, mounted in both serve-only and full-auth mode.

Routes:
    GET    /api/wow/feature-requests              — the public board
    GET    /api/wow/feature-requests/{id}         — one public story (or merge pointer)
    POST   /api/wow/feature-requests              — submit a request (Claude refines it)
    POST   /api/wow/feature-requests/{id}/vote    — "me too"
    DELETE /api/wow/feature-requests/{id}/vote    — take it back

Submitting spends Claude money with no login in serve-only prod, so POST is
gated cheapest-first, like the item reader (``wow_items.py``):

1. ``require_feature_requests_available`` — 503 ``feature_requests_unavailable``
   without ANTHROPIC_API_KEY, with WOW_FEATURE_REQUEST_DAILY_CAP <= 0, or (serve-only
   / production) without TURNSTILE_SECRET_KEY. A runtime 503, never a boot failure.
2. ``check_submit_ip_limits`` — per IP, 5 per hour AND 20 per day (429 + Retry-After).
3. ``require_turnstile`` — the shared Turnstile dependency.
4. The service: validation, inbox guard, fingerprint reuse, the durable daily
   cap on its own bucket, Claude, then the write.

Votes take no Turnstile (they work inside the Discord Activity) and only a
per-IP limit. The triage API is a separate router (``wow_feature_triage.py``).
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from platform_shared.core.request_utils import get_client_ip

from app.core.config import settings
from app.core.public_ai_availability import missing_public_ai_config
from app.core.rate_limit import RateLimiter, check_with_retry_after, require_turnstile
from app.core.seconds_until_utc_midnight import seconds_until_utc_midnight
from app.core.wow_feature_request_enums import ACTIVE_STORY_STATUSES, SORT_TOP
from app.core.wow_feature_request_limits import (
    BOARD_DEFAULT_LIMIT,
    BOARD_MAX_LIMIT,
    DETAIL_ALREADY_ANSWERED,
    DETAIL_DAILY_LIMIT,
    DETAIL_INBOX_FULL,
    DETAIL_NOT_FOUND,
    DETAIL_NOT_VOTABLE,
    DETAIL_REFINER_BUSY,
    DETAIL_REFINER_FAILED,
    DETAIL_UNAVAILABLE,
    DETAIL_VOTE_LIMIT,
)
from app.schemas.wow.feature_requests.feature_literals import BoardSort, PublicStoryStatus, StoryArea
from app.schemas.wow.feature_requests.feature_submit_request import FeatureSubmitRequest
from app.schemas.wow.feature_requests.feature_submit_response import FeatureSubmitResponse
from app.schemas.wow.feature_requests.public_story_list import PublicStoryList
from app.schemas.wow.feature_requests.public_story_lookup import PublicStoryLookup
from app.schemas.wow.feature_requests.vote_request import VoteRequest
from app.schemas.wow.feature_requests.vote_response import VoteResponse
from app.services.wow.feature_requests import (
    feature_board_service,
    feature_submission_service,
    feature_vote_service,
)
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureClarificationAnsweredError,
    FeatureInboxFullError,
    FeatureRefinerMisconfiguredError,
    FeatureRefinerRateLimitedError,
    FeatureRefinerUpstreamError,
    FeatureRequestDailyCapError,
    FeatureRequestError,
    FeatureRequestInputError,
    FeatureRequestNotConfiguredError,
    FeatureRequestNotFoundError,
    StoryNotVotableError,
    VoteLimitError,
)

logger = logging.getLogger(__name__)

_SECONDS_PER_HOUR = 3600
_SECONDS_PER_DAY = 86400
# Anthropic's rate-limit windows are per minute.
_REFINER_BUSY_RETRY_AFTER_SECONDS = 60

submit_hourly_limiter = RateLimiter(
    max_attempts=settings.wow_feature_submit_rate_limit_per_hour, window_seconds=_SECONDS_PER_HOUR
)
submit_daily_limiter = RateLimiter(
    max_attempts=settings.wow_feature_submit_rate_limit_per_day, window_seconds=_SECONDS_PER_DAY
)
vote_limiter = RateLimiter(
    max_attempts=settings.wow_feature_vote_rate_limit_per_hour, window_seconds=_SECONDS_PER_HOUR
)


async def require_feature_requests_available() -> None:
    missing = missing_public_ai_config(
        daily_cap=settings.wow_feature_request_daily_cap, cap_env_name="WOW_FEATURE_REQUEST_DAILY_CAP"
    )
    if missing:
        logger.warning("wow feature requests unavailable: not configured: %s", ",".join(missing))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=DETAIL_UNAVAILABLE)


async def check_submit_ip_limits(request: Request) -> None:
    ip = get_client_ip(request)
    check_with_retry_after(submit_hourly_limiter, f"wow-feature-submit-hour:{ip}")
    check_with_retry_after(submit_daily_limiter, f"wow-feature-submit-day:{ip}")


async def check_vote_ip_limit(request: Request) -> None:
    check_with_retry_after(vote_limiter, f"wow-feature-vote:{get_client_ip(request)}")


# (status, detail). ``None`` = the service's own message (input errors).
_ERROR_RESPONSES: dict[type[FeatureRequestError], tuple[int, str | None]] = {
    FeatureRequestInputError: (status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    FeatureRequestNotFoundError: (status.HTTP_404_NOT_FOUND, DETAIL_NOT_FOUND),
    FeatureClarificationAnsweredError: (status.HTTP_409_CONFLICT, DETAIL_ALREADY_ANSWERED),
    FeatureInboxFullError: (status.HTTP_503_SERVICE_UNAVAILABLE, DETAIL_INBOX_FULL),
    FeatureRequestNotConfiguredError: (status.HTTP_503_SERVICE_UNAVAILABLE, DETAIL_UNAVAILABLE),
    FeatureRequestDailyCapError: (status.HTTP_429_TOO_MANY_REQUESTS, DETAIL_DAILY_LIMIT),
    FeatureRefinerRateLimitedError: (status.HTTP_429_TOO_MANY_REQUESTS, DETAIL_REFINER_BUSY),
    FeatureRefinerMisconfiguredError: (status.HTTP_503_SERVICE_UNAVAILABLE, DETAIL_REFINER_FAILED),
    FeatureRefinerUpstreamError: (status.HTTP_503_SERVICE_UNAVAILABLE, DETAIL_REFINER_FAILED),
    StoryNotVotableError: (status.HTTP_409_CONFLICT, DETAIL_NOT_VOTABLE),
    VoteLimitError: (status.HTTP_429_TOO_MANY_REQUESTS, DETAIL_VOTE_LIMIT),
}


def _retry_after(exc: FeatureRequestError) -> dict[str, str] | None:
    if isinstance(exc, FeatureRequestDailyCapError):
        return {"Retry-After": str(seconds_until_utc_midnight())}
    if isinstance(exc, FeatureRefinerRateLimitedError):
        return {"Retry-After": str(_REFINER_BUSY_RETRY_AFTER_SECONDS)}
    return None


def _http_error(exc: FeatureRequestError) -> HTTPException:
    status_code, detail = _ERROR_RESPONSES.get(type(exc), (status.HTTP_502_BAD_GATEWAY, DETAIL_REFINER_FAILED))
    return HTTPException(status_code=status_code, detail=detail or str(exc), headers=_retry_after(exc))


public_router = APIRouter(prefix="/wow/feature-requests", tags=["wow"])


@public_router.get("", response_model=PublicStoryList)
async def list_feature_requests(
    status_filter: list[PublicStoryStatus] | None = Query(default=None, alias="status"),
    area: StoryArea | None = None,
    sort: BoardSort = SORT_TOP,
    limit: int = Query(default=BOARD_DEFAULT_LIMIT, ge=1, le=BOARD_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    client_id: uuid.UUID | None = None,
) -> PublicStoryList:
    """The board. Default filter: open, planned and in-progress stories."""
    return await feature_board_service.list_board(
        statuses=status_filter or ACTIVE_STORY_STATUSES,
        area=area,
        sort=sort,
        limit=limit,
        offset=offset,
        client_id=client_id,
    )


@public_router.get("/{story_id:uuid}", response_model=PublicStoryLookup)
async def get_feature_request(story_id: uuid.UUID) -> PublicStoryLookup:
    try:
        return await feature_board_service.get_story(story_id)
    except FeatureRequestError as exc:
        raise _http_error(exc) from exc


@public_router.post(
    "",
    response_model=FeatureSubmitResponse,
    # Order matters — FastAPI resolves these sequentially.
    dependencies=[
        Depends(require_feature_requests_available),
        Depends(check_submit_ip_limits),
        Depends(require_turnstile),
    ],
)
async def submit_feature_request(body: FeatureSubmitRequest, request: Request) -> FeatureSubmitResponse:
    try:
        return await feature_submission_service.submit_feature_request(body, ip=get_client_ip(request))
    except FeatureRequestError as exc:
        logger.info("wow feature request failed: %s", exc.error_type)
        raise _http_error(exc) from exc


@public_router.post(
    "/{story_id:uuid}/vote", response_model=VoteResponse, dependencies=[Depends(check_vote_ip_limit)]
)
async def vote(story_id: uuid.UUID, body: VoteRequest, request: Request) -> VoteResponse:
    try:
        return await feature_vote_service.cast_vote(
            story_id=story_id, client_id=body.client_id, ip=get_client_ip(request)
        )
    except FeatureRequestError as exc:
        raise _http_error(exc) from exc


@public_router.delete(
    "/{story_id:uuid}/vote", response_model=VoteResponse, dependencies=[Depends(check_vote_ip_limit)]
)
async def unvote(story_id: uuid.UUID, body: VoteRequest) -> VoteResponse:
    try:
        return await feature_vote_service.remove_vote(story_id=story_id, client_id=body.client_id)
    except FeatureRequestError as exc:
        raise _http_error(exc) from exc
