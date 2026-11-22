"""What a company research run found before asking Claude."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.services.integrations.tavily_service import TavilyResult


@dataclass(frozen=True)
class ResearchSearchResults:
    user_context: str | None
    review_results: list[TavilyResult]
    overview_results: list[TavilyResult]
    fetched_at: datetime
