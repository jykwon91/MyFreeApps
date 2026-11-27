"""What one research turn produced: the payload, its sources, and its accounting."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from platform_shared.extraction.web_source import WebSource


@dataclass
class ResearchResponse:
    """The parsed model payload, the sources behind it, and token accounting.

    ``data`` is the raw parsed JSON value (schema-valid when the caller
    supplied a ``json_schema``). Interpreting its shape is the caller's job —
    this module stays domain-free.

    ``sources`` holds only URLs that came back in a search or fetch result
    this turn, so a caller can drop any URL the payload names that isn't
    among them. ``tool_error_codes`` lists every server-tool failure as
    ``"<result block type>:<error_code>"`` (e.g.
    ``"web_search_tool_result:max_uses_exceeded"``): a failed search arrives
    as HTTP 200, so without these a caller can't tell a thin answer from a
    broken one. ``web_search_requests`` / ``web_fetch_requests`` are the
    billed counts from ``usage.server_tool_use``. ``input_tokens`` counts every
    input token, cached or not; ``cache_read_input_tokens`` and
    ``cache_creation_input_tokens`` say how many of them were prompt-cache reads
    and writes (billed differently). ``server_tool_uses`` counts
    every server-tool call block, including the code execution the 2026-02-09
    tools run for dynamic filtering.
    """

    data: Any
    sources: list[WebSource]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    model: str
    server_tool_uses: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0
    web_search_requests: int = 0
    web_fetch_requests: int = 0
    tool_error_codes: list[str] = field(default_factory=list)
