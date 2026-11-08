"""One conversation message. Which blocks a role may carry is checked by the service."""
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.wow.chat.chat_content_block import ChatContentBlock
from app.schemas.wow.chat.chat_literals import ChatRole


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: ChatRole
    content: list[ChatContentBlock] = Field(min_length=1)
