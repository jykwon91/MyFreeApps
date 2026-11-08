"""POST /wow/chat/turn body.

The whole conversation so far (the server stores nothing) plus the ticket from
the previous reply. Model, tools, system prompt, max_tokens and temperature
are the server's: sending any of them is a 422 (extra keys are forbidden).
Lengths and counts are checked by the service so each gets its own error code.
"""
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from app.core.wow_chat_limits import TICKET_MAX_CHARS
from app.schemas.wow.chat.chat_message import ChatMessage


class ChatTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(min_length=1)
    ticket: StrictStr | None = Field(default=None, max_length=TICKET_MAX_CHARS)
