"""Token counts Anthropic reported for one chat reply."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ReplyUsage:
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
