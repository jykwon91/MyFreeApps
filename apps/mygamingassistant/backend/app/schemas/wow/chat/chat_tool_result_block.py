"""What the browser's tool runner found, as a compact text summary for Claude."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

from app.core.wow_chat_limits import TOOL_USE_ID_PATTERN


class ChatToolResultBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["tool_result"]
    tool_use_id: StrictStr = Field(pattern=TOOL_USE_ID_PATTERN)
    content: StrictStr
    is_error: StrictBool = False
