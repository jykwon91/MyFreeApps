"""Parse, classify and validate the conversation the browser sends; digest it for tickets.

Every rule rejects with its own fixed code — nothing is trimmed. Sizes are 413
(``ChatTooLargeError``), shapes 422 (``ChatInputError``). Validation errors are
logged by code / location only, never with the message text.
"""
import hashlib
import json
import logging

from pydantic import ValidationError

from app.core.wow_chat_enums import (
    BLOCK_TEXT,
    BLOCK_TOOL_RESULT,
    ROLE_ASSISTANT,
    ROLE_USER,
    TURN_CONTINUATION,
    TURN_NEW_MESSAGE,
)
from app.core.wow_chat_limits import (
    CONVERSATION_MAX_CHARS,
    DETAIL_BAD_ASSISTANT_CONTENT,
    DETAIL_BAD_ROLE_ORDER,
    DETAIL_BAD_USER_CONTENT,
    DETAIL_CONVERSATION_TOO_LONG,
    DETAIL_FIRST_MESSAGE,
    DETAIL_INVALID_JSON,
    DETAIL_INVALID_REQUEST,
    DETAIL_MESSAGE_TOO_LONG,
    DETAIL_TOO_MANY_MESSAGES,
    DETAIL_TOO_MANY_TURNS,
    DETAIL_TOOL_RESULT_MISMATCH,
    DETAIL_TOOL_RESULT_REQUIRED,
    DETAIL_TOOL_RESULT_TOO_LARGE,
    MESSAGES_MAX,
    TOOL_RESULT_MAX_BYTES,
    USER_TEXT_MAX_CHARS,
    USER_TURNS_MAX,
)
from app.schemas.wow.chat.chat_message import ChatMessage
from app.schemas.wow.chat.chat_text_block import ChatTextBlock
from app.schemas.wow.chat.chat_tool_result_block import ChatToolResultBlock
from app.schemas.wow.chat.chat_tool_use_block import ChatToolUseBlock
from app.schemas.wow.chat.chat_turn_request import ChatTurnRequest
from app.services.wow.chat.chat_errors import ChatInputError, ChatTooLargeError
from app.services.wow.chat.validated_turn import ValidatedTurn

logger = logging.getLogger(__name__)


def _rejected(code: str) -> ChatInputError:
    logger.info("wow chat: request rejected reason=%s", code)
    return ChatInputError(code)


def _too_large(code: str) -> ChatTooLargeError:
    logger.info("wow chat: request rejected reason=%s", code)
    return ChatTooLargeError(code)


# --- Before validation ------------------------------------------------------------


def parse_payload(raw: bytes) -> dict[str, object]:
    """The body as a JSON object (it was already capped at 64 KB by the middleware)."""
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise _rejected(DETAIL_INVALID_JSON) from exc
    if not isinstance(payload, dict):
        raise _rejected(DETAIL_INVALID_JSON)
    return payload


def classify_payload(payload: dict[str, object]) -> str:
    """A continuation iff the last message is a user message of tool results only.

    Read from the raw JSON so the cheap gates (ticket, per-IP, Turnstile) run in
    the right order before full validation; validation re-checks the shape.
    """
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages or not isinstance(messages[-1], dict):
        return TURN_NEW_MESSAGE
    last = messages[-1]
    content = last.get("content")
    if last.get("role") != ROLE_USER or not isinstance(content, list) or not content:
        return TURN_NEW_MESSAGE
    if all(isinstance(block, dict) and block.get("type") == BLOCK_TOOL_RESULT for block in content):
        return TURN_CONTINUATION
    return TURN_NEW_MESSAGE


def parse_request(payload: dict[str, object]) -> ChatTurnRequest:
    try:
        return ChatTurnRequest.model_validate(payload)
    except ValidationError as exc:
        reasons = ",".join(sorted({f"{e['type']}@{e['loc'][0] if e['loc'] else ''}" for e in exc.errors()}))
        logger.info("wow chat: request rejected reason=%s errors=%s", DETAIL_INVALID_REQUEST, reasons)
        raise ChatInputError(DETAIL_INVALID_REQUEST) from exc


# --- Digest -------------------------------------------------------------------------


def _canonical(value: object) -> object:
    """JSON values as the browser will echo them: an integral float is an int (1.0 -> 1)."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: _canonical(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    return value


def conversation_digest(messages: list[ChatMessage]) -> str:
    dumped = _canonical([message.model_dump(mode="json") for message in messages])
    text = json.dumps(dumped, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(text.encode("ascii")).hexdigest()


# --- Validation ---------------------------------------------------------------------


def _block_chars(block: ChatTextBlock | ChatToolUseBlock | ChatToolResultBlock) -> int:
    if isinstance(block, ChatTextBlock):
        return len(block.text)
    if isinstance(block, ChatToolResultBlock):
        return len(block.content)
    return len(json.dumps(block.input, separators=(",", ":")))


def _check_sizes(messages: list[ChatMessage]) -> int:
    if len(messages) > MESSAGES_MAX:
        raise _too_large(DETAIL_TOO_MANY_MESSAGES)
    user_turns = 0
    total = 0
    for message in messages:
        texts = [b for b in message.content if isinstance(b, ChatTextBlock)]
        if message.role == ROLE_USER and texts:
            user_turns += 1
            if sum(len(b.text) for b in texts) > USER_TEXT_MAX_CHARS:
                raise _too_large(DETAIL_MESSAGE_TOO_LONG)
        for block in message.content:
            if isinstance(block, ChatToolResultBlock) and len(block.content.encode("utf-8")) > TOOL_RESULT_MAX_BYTES:
                raise _too_large(DETAIL_TOOL_RESULT_TOO_LARGE)
            total += _block_chars(block)
    if user_turns > USER_TURNS_MAX:
        raise _too_large(DETAIL_TOO_MANY_TURNS)
    if total > CONVERSATION_MAX_CHARS:
        raise _too_large(DETAIL_CONVERSATION_TOO_LONG)
    return total


def _check_roles(messages: list[ChatMessage]) -> None:
    first = messages[0]
    if first.role != ROLE_USER or any(block.type != BLOCK_TEXT for block in first.content):
        raise _rejected(DETAIL_FIRST_MESSAGE)
    for index, message in enumerate(messages):
        expected = ROLE_USER if index % 2 == 0 else ROLE_ASSISTANT
        if message.role != expected:
            raise _rejected(DETAIL_BAD_ROLE_ORDER)
    if messages[-1].role != ROLE_USER:
        raise _rejected(DETAIL_BAD_ROLE_ORDER)


def _check_user(message: ChatMessage) -> None:
    types = {block.type for block in message.content}
    if types not in ({BLOCK_TEXT}, {BLOCK_TOOL_RESULT}):
        raise _rejected(DETAIL_BAD_USER_CONTENT)
    if types == {BLOCK_TEXT} and not "".join(b.text for b in message.content if isinstance(b, ChatTextBlock)).strip():
        raise _rejected(DETAIL_BAD_USER_CONTENT)


def _check_assistant(message: ChatMessage) -> None:
    for block in message.content:
        if block.type == BLOCK_TOOL_RESULT or (isinstance(block, ChatTextBlock) and not block.text.strip()):
            raise _rejected(DETAIL_BAD_ASSISTANT_CONTENT)


def _tool_use_ids(message: ChatMessage) -> list[str]:
    return [block.id for block in message.content if isinstance(block, ChatToolUseBlock)]


def _tool_result_ids(message: ChatMessage) -> list[str]:
    return [block.tool_use_id for block in message.content if isinstance(block, ChatToolResultBlock)]


def _check_pairing(messages: list[ChatMessage]) -> None:
    """Each assistant tool call is answered by exactly the next user message — and nothing else is."""
    for index, message in enumerate(messages):
        if message.role == ROLE_USER:
            _check_user(message)
            results = _tool_result_ids(message)
            if not results:
                continue
            calls = _tool_use_ids(messages[index - 1]) if index > 0 else []
            if not calls or len(results) != len(set(results)) or sorted(results) != sorted(calls):
                raise _rejected(DETAIL_TOOL_RESULT_MISMATCH)
            continue
        _check_assistant(message)
        calls = _tool_use_ids(message)
        if len(calls) != len(set(calls)):
            raise _rejected(DETAIL_BAD_ASSISTANT_CONTENT)
        following = messages[index + 1] if index + 1 < len(messages) else None
        if calls and following is not None and not _tool_result_ids(following):
            raise _rejected(DETAIL_TOOL_RESULT_REQUIRED)


def validate_turn(request: ChatTurnRequest) -> ValidatedTurn:
    messages = request.messages
    total = _check_sizes(messages)
    _check_roles(messages)
    _check_pairing(messages)
    kind = TURN_CONTINUATION if _tool_result_ids(messages[-1]) else TURN_NEW_MESSAGE
    return ValidatedTurn(kind=kind, messages=messages, ticket=request.ticket, total_chars=total)

