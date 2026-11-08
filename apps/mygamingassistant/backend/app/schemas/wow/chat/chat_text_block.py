"""A plain-text content block (user question or Claude's prose)."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictStr


class ChatTextBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: StrictStr
