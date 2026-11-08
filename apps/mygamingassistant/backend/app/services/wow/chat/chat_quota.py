"""Durable daily token budgets for the chat relay (``daily_usage_counters``).

Before each Claude call an upper bound is reserved on BOTH the global bucket
(``wow-chat``) and the caller's network bucket (``wow-chat-ip:<hmac>``), in one
transaction — if either can't take it, neither is charged. After the call the
unused part is released using Anthropic's reported usage; a failed call
releases everything. Weighting mirrors cost: output x5, cache reads /10.

Estimate = ceil(chars / 3) of input (system prompt + tools + conversation) +
5 x max_tokens of output — an upper bound, so a call never spends more than
it reserved in practice (if it ever does, the excess is logged, not charged).
"""
import logging
import math

from platform_shared.repositories.daily_quota_repo import (
    release_daily_quota,
    try_consume_daily_quota_amount,
    utc_today,
)

from app.core.config import settings
from app.core.wow_chat_limits import (
    CACHE_READ_TOKEN_DIVISOR,
    CHARS_PER_TOKEN_ESTIMATE,
    DETAIL_DAILY_LIMIT,
    DETAIL_IP_DAILY_LIMIT,
    GLOBAL_TOKEN_BUCKET,
    IP_TOKEN_BUCKET_PREFIX,
    OUTPUT_TOKEN_WEIGHT,
)
from app.db.session import unit_of_work
from app.services.wow.chat.chat_errors import ChatDailyCapError
from app.services.wow.chat.chat_tool_schema import CHAT_TOOLS, SYSTEM_PROMPT
from app.services.wow.chat.reply_usage import ReplyUsage
from app.services.wow.chat.token_reservation import TokenReservation

logger = logging.getLogger(__name__)

# The fixed part of every request: system prompt + tool definitions.
FIXED_PROMPT_CHARS = len(SYSTEM_PROMPT) + len(str(CHAT_TOOLS))


def estimate_tokens(conversation_chars: int) -> int:
    input_tokens = math.ceil((FIXED_PROMPT_CHARS + conversation_chars) / CHARS_PER_TOKEN_ESTIMATE)
    return input_tokens + OUTPUT_TOKEN_WEIGHT * settings.wow_chat_max_tokens


def weighted_tokens(usage: ReplyUsage) -> int:
    return (
        usage.input_tokens
        + usage.cache_creation_input_tokens
        + math.ceil(usage.cache_read_input_tokens / CACHE_READ_TOKEN_DIVISOR)
        + OUTPUT_TOKEN_WEIGHT * usage.output_tokens
    )


def ip_bucket(network_hash: str) -> str:
    return f"{IP_TOKEN_BUCKET_PREFIX}{network_hash}"


async def reserve(*, conversation_chars: int, network_hash: str) -> TokenReservation:
    amount = estimate_tokens(conversation_chars)
    day = utc_today()
    bucket = ip_bucket(network_hash)
    async with unit_of_work() as db:
        if not await try_consume_daily_quota_amount(
            db, bucket=GLOBAL_TOKEN_BUCKET, cap=settings.wow_chat_daily_token_cap, amount=amount, day=day
        ):
            logger.warning("wow chat: global daily token cap reached (cap=%d)", settings.wow_chat_daily_token_cap)
            raise ChatDailyCapError(DETAIL_DAILY_LIMIT)
        if not await try_consume_daily_quota_amount(
            db, bucket=bucket, cap=settings.wow_chat_ip_daily_token_cap, amount=amount, day=day
        ):
            # Raising rolls the transaction back, so the global reservation is undone too.
            logger.info("wow chat: network daily token cap reached ip_hash=%s", network_hash[:12])
            raise ChatDailyCapError(DETAIL_IP_DAILY_LIMIT)
    return TokenReservation(day=day, amount=amount, ip_bucket=bucket)


async def _release(reservation: TokenReservation, amount: int) -> None:
    if amount <= 0:
        return
    async with unit_of_work() as db:
        await release_daily_quota(db, bucket=GLOBAL_TOKEN_BUCKET, amount=amount, day=reservation.day)
        await release_daily_quota(db, bucket=reservation.ip_bucket, amount=amount, day=reservation.day)


async def settle(reservation: TokenReservation, usage: ReplyUsage) -> int:
    """Hand back what the call didn't use; returns the weighted tokens it did use."""
    used = weighted_tokens(usage)
    if used > reservation.amount:
        logger.warning("wow chat: call used more than reserved (used=%d reserved=%d)", used, reservation.amount)
    await _release(reservation, reservation.amount - used)
    return used


async def release_all(reservation: TokenReservation) -> None:
    await _release(reservation, reservation.amount)
