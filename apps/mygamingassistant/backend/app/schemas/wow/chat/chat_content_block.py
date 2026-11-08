"""Any content block the relay accepts: text, tool_use or tool_result — nothing else.

No system, image, document, thinking or server-tool blocks, and no
``cache_control`` (every block model forbids extra keys).
"""
from typing import Annotated

from pydantic import Field

from app.schemas.wow.chat.chat_text_block import ChatTextBlock
from app.schemas.wow.chat.chat_tool_result_block import ChatToolResultBlock
from app.schemas.wow.chat.chat_tool_use_block import ChatToolUseBlock

ChatContentBlock = Annotated[ChatTextBlock | ChatToolUseBlock | ChatToolResultBlock, Field(discriminator="type")]
