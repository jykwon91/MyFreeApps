"""POST /wow/chat/turn response.

``message`` is Claude's reply (assistant role; text + tool_use blocks only,
tool names from the fixed list). The browser appends it to the conversation,
runs any tool calls and sends the results back with ``ticket``.
``rounds_left`` = tool-result calls still allowed for this question.
"""
from pydantic import BaseModel, ConfigDict

from app.schemas.wow.chat.chat_literals import ChatStopReason
from app.schemas.wow.chat.chat_message import ChatMessage


class ChatTurnResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatMessage
    stop_reason: ChatStopReason
    ticket: str
    rounds_left: int
