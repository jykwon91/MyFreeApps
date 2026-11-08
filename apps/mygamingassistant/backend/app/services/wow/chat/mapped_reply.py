"""Claude's reply, cut down to what the relay passes to the browser."""
from dataclasses import dataclass

from app.schemas.wow.chat.chat_message import ChatMessage
from app.services.wow.chat.reply_usage import ReplyUsage


@dataclass(frozen=True)
class MappedReply:
    message: ChatMessage
    stop_reason: str
    usage: ReplyUsage
    dropped_blocks: int
    """Blocks Claude returned that the relay did not pass on (counted for logs)."""
