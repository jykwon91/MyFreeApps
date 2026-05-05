"""Company research service — orchestrates Tavily → Claude → persistence.

Flow for POST /companies/{company_id}/research:

  1. Verify the company exists and belongs to the requesting user.
  2. Call Tavily to fetch recent web search results about the company.
  3. Build a context string from the Tavily results.
  4. Call Claude (via claude_service.call_claude) to synthesise the results
     into a structured JSON envelope.
  5. Map the Claude output to CompanyResearch + ResearchSource fields.
  6. Upsert the CompanyResearch row (replacing any prior research run).
  7. Write fresh ResearchSource rows (old ones cascade-deleted on upsert).
  8. Commit and return the fully-populated research record.

Fail-loud:
  - TavilyNotConfiguredError → propagated to the route → HTTP 503.
  - anthropic.APIError / ValueError from Claude → propagated → HTTP 502.
  - Company not found or wrong tenant → returns None → route emits HTTP 404.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company_research import CompanyResearch
from app.repositories.company import company_repository, company_research_repository
from app.services.extraction import claude_service
from app.services.extraction.prompts.company_research_prompt import COMPANY_RESEARCH_PROMPT
from app.services.integrations.tavily_service import search_company

logger = logging.getLogger(__name__)

# Allowed sentiment values from the Claude prompt.
_VALID_SENTIMENTS = frozenset({"positive", "mixed", "negative", "unknown"})
_VALID_CONFIDENCES = frozenset({"high", "medium", "low", "unknown"})


def _safe_sentiment(value: str | None) -> str:
    """Map Claude's sentiment output to a valid DB value."""
    if value in _VALID_SENTIMENTS:
        return value
    return "unknown"


def _build_tavily_context(company_name: str, results: list[dict]) -> str:
    """Format Tavily results into a prompt-friendly context string."""
    if not results:
        return f"No search results found for {company_name}."

    parts = [f"# Web research results for {company_name}\n"]
    for i, r in enumerate(results, start=1):
        title = r.get("title") or "Untitled"
        url = r.get("url", "")
        content = r.get("content") or ""
        # Truncate long snippets to keep the prompt size bounded.
        snippet = content[:800] if content else "(no content)"
        parts.append(f"## Source {i}: {title}\nURL: {url}\n{snippet}\n")

    return "\n".join(parts)


async def run_research(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    """Run Tavily + Claude research for a company and persist the result.

    Returns:
        The updated CompanyResearch ORM instance with sources loaded, or None
        if the company is not found / belongs to another user.

    Raises:
        TavilyNotConfiguredError: if Tavily API key is missing in non-dev.
        anthropic.APIError: on non-retryable Claude API failures.
        ValueError: if Claude returns malformed JSON.
    """
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None

    # 1. Fetch Tavily search results.
    fetched_at = datetime.now(timezone.utc)
    tavily_results = await search_company(
        company_name=company.name,
        domain=company.primary_domain,
    )
    logger.info(
        "Tavily returned %d results for company %s",
        len(tavily_results),
        company_id,
    )

    # 2. Build context + call Claude.
    context = _build_tavily_context(company.name, list(tavily_results))
    raw: dict = await claude_service.call_claude(
        system_prompt=COMPANY_RESEARCH_PROMPT,
        user_content=context,
        context_type="company_research",
        context_id=company_id,
        user_id=user_id,
    )

    # 3. Map Claude output to DB fields.
    sentiment = _safe_sentiment(raw.get("sentiment"))

    # senior_engineer_sentiment lives in the model as the free-text analysis
    # field. We store Claude's culture_signals there.
    senior_engineer_sentiment = raw.get("culture_signals")

    # interview_process: not directly returned by Claude today; use headline
    # as a brief summary if present.
    interview_process = raw.get("summary")

    red_flags: list[str] = raw.get("red_flags") or []
    green_flags: list[str] = raw.get("green_flags") or []

    # Comp range: not returned by this prompt version; left null.
    reported_comp_range_min: float | None = None
    reported_comp_range_max: float | None = None
    comp_currency = "USD"
    comp_confidence = "unknown"

    if raw.get("compensation_signals"):
        comp_confidence = "low"

    # 4. Persist CompanyResearch.
    research = await company_research_repository.upsert_for_company(
        db,
        company_id=company_id,
        user_id=user_id,
        overall_sentiment=sentiment,
        senior_engineer_sentiment=senior_engineer_sentiment,
        interview_process=interview_process,
        red_flags=red_flags[:20],   # Enforce model constraint
        green_flags=green_flags[:20],
        reported_comp_range_min=reported_comp_range_min,
        reported_comp_range_max=reported_comp_range_max,
        comp_currency=comp_currency,
        comp_confidence=comp_confidence,
        raw_synthesis=raw,
    )

    # 5. Persist sources (previous sources cascade-deleted on upsert).
    source_dicts = [
        {
            "url": r["url"],
            "title": r.get("title"),
            "snippet": r.get("content"),
            "source_type": r["source_type"],
            "fetched_at": fetched_at,
        }
        for r in tavily_results
        if r.get("url")
    ]
    await company_research_repository.create_sources(
        db,
        research_id=research.id,
        user_id=user_id,
        sources=source_dicts,
    )

    # Commit and refresh sources via the repository (keeps transaction ownership
    # out of the service layer).
    research = await company_research_repository.commit_with_sources_refresh(db, research)

    logger.info(
        "Company research complete: company=%s research=%s sentiment=%s sources=%d",
        company_id,
        research.id,
        sentiment,
        len(source_dicts),
    )
    return research


async def get_research(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    """Return the most recent research for a company, or None if not yet run.

    Verifies the company exists and belongs to user_id before returning.
    """
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None

    research = await company_research_repository.get_by_company_id(db, company_id, user_id)
    if research is None:
        return None

    # Eagerly load sources for the response.
    sources = await company_research_repository.list_sources_for_research(
        db, research.id, user_id
    )
    # Attach sources directly to avoid a second round-trip via relationship.
    research.sources = sources
    return research
