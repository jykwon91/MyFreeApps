"""Pydantic schema for POST /applications/parse-jd request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_JD_TEXT_MAX_LEN = 50_000


class JdParseRequest(BaseModel):
    """Body for POST /applications/parse-jd.

    ``jd_text`` is the only required field — it carries the raw pasted
    job description text that Claude will extract fields from.
    ``extra='forbid'`` prevents injection of extra keys.
    """

    jd_text: str = Field(min_length=1, max_length=_JD_TEXT_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
