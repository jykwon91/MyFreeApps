"""One idea from a research reply after validation, ready to store."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ParsedSavingsIdea:
    idea_key: str
    category: str
    subject: str
    title: str
    savings_low_cents: int
    savings_high_cents: int
    effort: str
    why_it_fits: str
    steps: list[str] = field(default_factory=list)
    source_urls: list[str] = field(default_factory=list)
    expires_on: _dt.date | None = None
    card_details: dict[str, Any] | None = None
