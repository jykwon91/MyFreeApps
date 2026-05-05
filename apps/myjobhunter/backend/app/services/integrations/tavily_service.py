"""Tavily Search API client for MJH company research.

Fail-loud policy:
- If ``tavily_api_key`` is empty and we are NOT in development mode (detected
  by ``MYJOBHUNTER_ENV=development``), raises ``TavilyNotConfiguredError`` at
  first use so the problem is immediately visible.
- If empty and in development mode, returns a stub response with a warning log
  so local dev can exercise the research pipeline without a live API key.

Single public entry-point: ``search_company(company_name, domain)`` — returns
a list of ``TavilyResult`` dicts suitable for building the research prompt.
"""
from __future__ import annotations

import logging
import os
from typing import TypedDict

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_TAVILY_SEARCH_URL = "https://api.tavily.com/search"
_TIMEOUT_SECONDS = 30.0
_MAX_RESULTS = 10


class TavilyNotConfiguredError(RuntimeError):
    """Raised when TAVILY_API_KEY is absent in a non-development environment."""


class TavilyResult(TypedDict):
    url: str
    title: str | None
    content: str | None
    score: float | None
    source_type: str


def _is_dev_environment() -> bool:
    return os.environ.get("MYJOBHUNTER_ENV", "").lower() == "development"


def _classify_source_type(url: str) -> str:
    """Infer a research_sources.source_type value from the URL."""
    lower = url.lower()
    if "glassdoor.com" in lower:
        return "glassdoor"
    if "teamblind.com" in lower or "blind.com" in lower:
        return "teamblind"
    if "reddit.com" in lower:
        return "reddit"
    if "levels.fyi" in lower:
        return "levels"
    if "payscale.com" in lower:
        return "payscale"
    # Official or press sources
    for official_indicator in ("/about", "/careers", "/jobs", "/press", "/blog"):
        if official_indicator in lower:
            return "official"
    return "other"


def _build_query(company_name: str, domain: str | None) -> str:
    """Build a targeted Tavily query for company research."""
    parts = [f"{company_name} company reviews"]
    if domain:
        parts.append(f"OR site:{domain}")
    parts.append("employee reviews culture compensation")
    return " ".join(parts)


async def search_company(company_name: str, domain: str | None = None) -> list[TavilyResult]:
    """Search Tavily for company research on ``company_name``.

    Args:
        company_name: The company name to research.
        domain: Optional primary domain; used to build a tighter query.

    Returns:
        List of ``TavilyResult`` dicts with url, title, content, score, source_type.

    Raises:
        TavilyNotConfiguredError: if TAVILY_API_KEY is missing in non-dev.
        httpx.HTTPError: on network failures.
        httpx.HTTPStatusError: on non-2xx responses from Tavily.
    """
    if not settings.tavily_api_key:
        if _is_dev_environment():
            logger.warning(
                "TAVILY_API_KEY not configured — returning stub response for dev mode"
            )
            return _stub_results(company_name)
        raise TavilyNotConfiguredError(
            "TAVILY_API_KEY is not configured. "
            "Set it in .env.docker or set MYJOBHUNTER_ENV=development for stub mode."
        )

    query = _build_query(company_name, domain)

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        response = await client.post(
            _TAVILY_SEARCH_URL,
            json={
                "api_key": settings.tavily_api_key,
                "query": query,
                "search_depth": "advanced",
                "include_answer": False,
                "include_raw_content": False,
                "max_results": _MAX_RESULTS,
                "include_domains": [
                    "glassdoor.com",
                    "teamblind.com",
                    "reddit.com",
                    "levels.fyi",
                    "payscale.com",
                ],
            },
        )
        response.raise_for_status()
        data = response.json()

    results = data.get("results", [])
    return [
        TavilyResult(
            url=r.get("url", ""),
            title=r.get("title"),
            content=r.get("content"),
            score=r.get("score"),
            source_type=_classify_source_type(r.get("url", "")),
        )
        for r in results
        if r.get("url")
    ]


def _stub_results(company_name: str) -> list[TavilyResult]:
    """Development stub — returns fake results so the pipeline can be exercised."""
    return [
        TavilyResult(
            url=f"https://glassdoor.com/reviews/{company_name.lower().replace(' ', '-')}",
            title=f"{company_name} Reviews | Glassdoor",
            content=(
                f"Employees at {company_name} report a positive work environment. "
                "Culture is collaborative and compensation is competitive. "
                "Management is transparent and supportive. Work-life balance is good. "
                "Interview process involves 3-4 rounds including a technical screen."
            ),
            score=0.9,
            source_type="glassdoor",
        ),
        TavilyResult(
            url=f"https://reddit.com/r/cscareerquestions/search?q={company_name.replace(' ', '+')}",
            title=f"{company_name} — Reddit career discussion",
            content=(
                f"Multiple engineers report {company_name} pays market rate or above. "
                "Benefits package is solid. Some reports of long hours during crunch periods. "
                "Overall sentiment is positive for senior roles."
            ),
            score=0.75,
            source_type="reddit",
        ),
    ]
