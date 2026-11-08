"""A chat request that passed every transcript rule."""
from dataclasses import dataclass

from app.schemas.wow.chat.chat_message import ChatMessage


@dataclass(frozen=True)
class ValidatedTurn:
    kind: str
    """``TURN_NEW_MESSAGE`` or ``TURN_CONTINUATION`` (``app/core/wow_chat_enums.py``)."""
    messages: list[ChatMessage]
    ticket: str | None
    total_chars: int
