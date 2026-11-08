"""One chat turn: transcript rules -> ticket digest -> token reservation -> Claude -> reply + new ticket.

Stateless: the browser sends the whole conversation every time and nothing is
stored. The route has already run the cheap gates (availability, body cap,
ticket signature for continuations, per-IP limits, Turnstile for new
messages). What's checked here:

- every transcript rule (``chat_transcript.validate_turn``);
- the ticket's digest equals the conversation minus its last message — so the
  history (including Claude's earlier tool calls) is exactly what this server
  answered. A new message with history needs a ticket too; a first message
  doesn't;
- the durable token budgets, reserved before the call and settled after it.

Logs carry codes, counts, usage, the stop reason, the round and a short
network hash — never message text, tool inputs / results or model output.
"""
import logging

from app.core.wow_chat_enums import TURN_CONTINUATION
from app.core.wow_chat_limits import DETAIL_INVALID_REQUEST, DETAIL_ROUNDS_EXHAUSTED, TOOL_ROUNDS_MAX
from app.schemas.wow.chat.chat_turn_request import ChatTurnRequest
from app.schemas.wow.chat.chat_turn_response import ChatTurnResponse
from app.services.wow.chat import chat_client, chat_quota
from app.services.wow.chat.chat_errors import ChatInputError, ChatRoundsExhaustedError
from app.services.wow.chat.chat_response_mapper import map_reply, map_usage
from app.services.wow.chat.chat_ticket import issue_ticket, read_ticket, require_digest
from app.services.wow.chat.chat_transcript import conversation_digest, validate_turn
from app.services.wow.chat.ticket_claims import TicketClaims
from app.services.wow.chat.validated_turn import ValidatedTurn

logger = logging.getLogger(__name__)

_IP_HASH_LOG_CHARS = 12


def check_rounds_left(claims: TicketClaims) -> None:
    if claims.rounds_left <= 0:
        logger.info("wow chat: request rejected reason=%s", DETAIL_ROUNDS_EXHAUSTED)
        raise ChatRoundsExhaustedError(DETAIL_ROUNDS_EXHAUSTED)


def _verified_claims(turn: ValidatedTurn, *, network_hash: str, claims: TicketClaims | None) -> TicketClaims | None:
    """The ticket covering this conversation's history; None for a first message."""
    history = turn.messages[:-1]
    if not history:
        return None
    verified = claims or read_ticket(turn.ticket, network_hash=network_hash)
    require_digest(verified, conversation_digest(history))
    return verified


def _rounds_after(turn: ValidatedTurn, claims: TicketClaims | None) -> int:
    if turn.kind == TURN_CONTINUATION and claims is not None:
        return claims.rounds_left - 1
    return TOOL_ROUNDS_MAX


async def run_turn(
    request: ChatTurnRequest,
    *,
    expected_kind: str,
    network_hash: str,
    claims: TicketClaims | None,
) -> ChatTurnResponse:
    """``claims`` = the ticket the route already verified (continuations), else None."""
    turn = validate_turn(request)
    if turn.kind != expected_kind:
        raise ChatInputError(DETAIL_INVALID_REQUEST)
    verified = _verified_claims(turn, network_hash=network_hash, claims=claims)
    rounds_left = _rounds_after(turn, verified)
    allow_tools = rounds_left > 0
    reservation = await chat_quota.reserve(conversation_chars=turn.total_chars, network_hash=network_hash)
    try:
        response = await chat_client.create_reply(
            [message.model_dump(mode="json") for message in turn.messages], allow_tools=allow_tools
        )
    except Exception:
        # No reply = nothing spent (Anthropic bills nothing for a failed call).
        await chat_quota.release_all(reservation)
        raise
    usage = map_usage(response)
    used = await chat_quota.settle(reservation, usage)
    reply = map_reply(response, allow_tools=allow_tools)
    logger.info(
        "wow chat: turn kind=%s round=%d stop=%s in=%d out=%d cache_read=%d cache_write=%d weighted=%d "
        "dropped=%d ip_hash=%s",
        turn.kind,
        TOOL_ROUNDS_MAX - rounds_left,
        reply.stop_reason,
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_read_input_tokens,
        usage.cache_creation_input_tokens,
        used,
        reply.dropped_blocks,
        network_hash[:_IP_HASH_LOG_CHARS],
    )
    ticket = issue_ticket(
        network_hash=network_hash,
        rounds_left=rounds_left,
        digest=conversation_digest([*turn.messages, reply.message]),
    )
    return ChatTurnResponse(
        message=reply.message, stop_reason=reply.stop_reason, ticket=ticket, rounds_left=rounds_left
    )
