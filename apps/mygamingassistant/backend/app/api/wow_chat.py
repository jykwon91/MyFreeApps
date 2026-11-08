"""WoW Forever "Ask" chat relay — PUBLIC, mounted in both serve-only and full-auth mode.

Route:
    POST /api/wow/chat/turn — send the conversation, get Claude's next reply + a ticket

A stateless relay: the server adds its own system prompt, fixed tools, model
and max_tokens; the BROWSER runs the tool calls against its bundled game data
and sends the results back. It spends Claude money with no login, so it is
gated cheapest-first:

1. ``BodySizeCapMiddleware`` (``app/core/body_size_cap.py``) — 413
   ``chat_body_too_large`` above 64 KB, before anything parses the body.
2. ``require_wow_chat_available`` — 503 ``chat_unavailable`` without
   ANTHROPIC_API_KEY, with a token cap <= 0, or (serve-only / production)
   without TURNSTILE_SECRET_KEY. A runtime 503, never a boot failure.
3. Continuation (the last message is tool results): the ticket's signature,
   expiry, network and rounds left -> per-IP 60/h.
   New message: per-IP 20/h + 60/day -> Turnstile (action ``wow-chat``).
4. The service: transcript rules, ticket digest, durable token budgets
   (global + per network), Claude, then the reply and a new ticket.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from platform_shared.core.request_utils import get_client_ip

from app.core.config import settings
from app.core.public_ai_availability import missing_public_ai_config
from app.core.rate_limit import RateLimiter, check_with_retry_after, require_wow_chat_turnstile
from app.core.seconds_until_utc_midnight import seconds_until_utc_midnight
from app.core.wow_chat_enums import TURN_CONTINUATION
from app.core.wow_chat_limits import (
    DETAIL_FAILED,
    DETAIL_UNAVAILABLE,
    UPSTREAM_BUSY_RETRY_AFTER_SECONDS,
)
from app.schemas.wow.chat.chat_turn_response import ChatTurnResponse
from app.services.wow.chat import chat_service
from app.services.wow.chat.chat_errors import (
    ChatDailyCapError,
    ChatInputError,
    ChatRoundsExhaustedError,
    ChatTicketExpiredError,
    ChatTicketInvalidError,
    ChatTooLargeError,
    ChatUpstreamBusyError,
    ChatUpstreamError,
    WowChatError,
)
from app.services.wow.chat.chat_keys import network_hash
from app.services.wow.chat.chat_ticket import read_ticket
from app.services.wow.chat.chat_transcript import classify_payload, parse_payload, parse_request

logger = logging.getLogger(__name__)

_SECONDS_PER_HOUR = 3600
_SECONDS_PER_DAY = 86400

turn_hourly_limiter = RateLimiter(
    max_attempts=settings.wow_chat_turn_rate_limit_per_hour, window_seconds=_SECONDS_PER_HOUR
)
turn_daily_limiter = RateLimiter(max_attempts=settings.wow_chat_turn_rate_limit_per_day, window_seconds=_SECONDS_PER_DAY)
continuation_limiter = RateLimiter(
    max_attempts=settings.wow_chat_continuation_rate_limit_per_hour, window_seconds=_SECONDS_PER_HOUR
)

_STATUS: dict[type[WowChatError], int] = {
    ChatInputError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ChatTooLargeError: status.HTTP_413_CONTENT_TOO_LARGE,
    ChatTicketInvalidError: status.HTTP_400_BAD_REQUEST,
    ChatTicketExpiredError: status.HTTP_409_CONFLICT,
    ChatRoundsExhaustedError: status.HTTP_409_CONFLICT,
    ChatDailyCapError: status.HTTP_429_TOO_MANY_REQUESTS,
    ChatUpstreamBusyError: status.HTTP_429_TOO_MANY_REQUESTS,
    ChatUpstreamError: status.HTTP_503_SERVICE_UNAVAILABLE,
}


async def require_wow_chat_available() -> None:
    missing = missing_public_ai_config(
        daily_cap=min(settings.wow_chat_daily_token_cap, settings.wow_chat_ip_daily_token_cap),
        cap_env_name="WOW_CHAT_DAILY_TOKEN_CAP/WOW_CHAT_IP_DAILY_TOKEN_CAP",
    )
    if missing:
        logger.warning("wow chat unavailable: not configured: %s", ",".join(missing))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=DETAIL_UNAVAILABLE)


def _retry_after(exc: WowChatError) -> dict[str, str] | None:
    if isinstance(exc, ChatDailyCapError):
        return {"Retry-After": str(seconds_until_utc_midnight())}
    if isinstance(exc, ChatUpstreamBusyError):
        return {"Retry-After": str(UPSTREAM_BUSY_RETRY_AFTER_SECONDS)}
    return None


def _http_error(exc: WowChatError) -> HTTPException:
    status_code = _STATUS.get(type(exc), status.HTTP_502_BAD_GATEWAY)
    detail = exc.code if type(exc) in _STATUS else DETAIL_FAILED
    return HTTPException(status_code=status_code, detail=detail, headers=_retry_after(exc))


router = APIRouter(prefix="/wow/chat", tags=["wow"])


@router.post("/turn", response_model=ChatTurnResponse, dependencies=[Depends(require_wow_chat_available)])
async def chat_turn(request: Request) -> ChatTurnResponse:
    ip = get_client_ip(request)
    caller = network_hash(ip)
    try:
        payload = parse_payload(await request.body())
        kind = classify_payload(payload)
        claims = None
        if kind == TURN_CONTINUATION:
            claims = read_ticket(payload.get("ticket"), network_hash=caller)
            chat_service.check_rounds_left(claims)
            check_with_retry_after(continuation_limiter, f"wow-chat-continue:{ip}")
        else:
            check_with_retry_after(turn_hourly_limiter, f"wow-chat-turn-hour:{ip}")
            check_with_retry_after(turn_daily_limiter, f"wow-chat-turn-day:{ip}")
            await require_wow_chat_turnstile(request)
        body = parse_request(payload)
        return await chat_service.run_turn(body, expected_kind=kind, network_hash=caller, claims=claims)
    except WowChatError as exc:
        logger.info("wow chat failed: %s (%s)", exc.code, exc.error_type)
        raise _http_error(exc) from exc
