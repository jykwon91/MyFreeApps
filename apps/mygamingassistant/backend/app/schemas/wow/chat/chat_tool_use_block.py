"""A tool call Claude made — only ever produced by the server.

The browser echoes it back in later requests; the ticket digest proves it is
unchanged, and the name is one of the fixed tools.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StrictStr

from app.core.wow_chat_limits import TOOL_USE_ID_PATTERN
from app.schemas.wow.chat.chat_literals import ChatToolName


class ChatToolUseBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["tool_use"]
    id: StrictStr = Field(pattern=TOOL_USE_ID_PATTERN)
    name: ChatToolName
    input: dict[str, JsonValue]
