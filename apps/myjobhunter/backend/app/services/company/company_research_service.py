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

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.models.company.company_research import CompanyResearch
from app.repositories.company import company_repository, company_research_repository
from app.repositories.profile import (
    profile_repository,
    skill_repository,
    work_history_repository,
)
from app.services.extraction import claude_service
from app.services.extraction.prompts.company_research_prompt import COMPANY_RESEARCH_PROMPT
from app.services.integrations.tavily_service import (
    search_company,
    search_company_overview,
)

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


_MAX_USER_BULLETS = 8        # Across all roles, not per-role
_MAX_USER_SKILLS = 15
_MAX_USER_ROLES = 3          # Most recent N work entries
_MAX_BULLET_CHARS = 220


async def _build_user_context(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    """Build a compact user-profile block to feed Claude for personalisation.

    Returns ``None`` when the user has no resume content uploaded — the
    prompt then skips ``products_for_you`` synthesis entirely (returns
    null in the JSON envelope).

    Pulls:
    - profile.summary + seniority (resume-level context)
    - last N work_history rows (title + company + bullets)
    - top M skills

    Bounds (``_MAX_*``) keep the prompt size predictable. The returned
    string is plain markdown.
    """
    profile = await profile_repository.get_by_user_id(db, user_id)
    if profile is None:
        return None

    work_history = await work_history_repository.list_by_user(db, user_id)
    skills = await skill_repository.list_by_user(db, user_id)

    has_summary = bool((profile.summary or "").strip())
    has_history = bool(work_history)
    has_skills = bool(skills)
    if not (has_summary or has_history or has_skills):
        return None

    parts = ["# User profile (job seeker requesting this research)\n"]

    if profile.seniority:
        parts.append(f"Seniority: {profile.seniority}\n")
    if has_summary:
        parts.append(f"Resume summary:\n{profile.summary}\n")

    if has_history:
        # Most-recent first. ``end_date IS NULL`` (current role) sorts above
        # any specific date, so map None to a far-future sentinel for sort.
        sorted_history = sorted(
            work_history,
            key=lambda w: (w.end_date or datetime.now(timezone.utc).date()),
            reverse=True,
        )[:_MAX_USER_ROLES]
        parts.append("Recent roles:")
        bullets_used = 0
        for w in sorted_history:
            end_label = w.end_date.isoformat() if w.end_date else "Present"
            parts.append(
                f"- {w.title} at {w.company_name} "
                f"({w.start_date.isoformat()} → {end_label})"
            )
            for bullet in (w.bullets or []):
                if bullets_used >= _MAX_USER_BULLETS:
                    break
                trimmed = bullet.strip()
                if not trimmed:
                    continue
                if len(trimmed) > _MAX_BULLET_CHARS:
                    trimmed = trimmed[: _MAX_BULLET_CHARS - 1] + "…"
                parts.append(f"    • {trimmed}")
                bullets_used += 1
            if bullets_used >= _MAX_USER_BULLETS:
                break
        parts.append("")

    if has_skills:
        # Skills are simple strings; cap to keep prompt tight.
        top_skills = [s.name for s in skills[:_MAX_USER_SKILLS]]
        parts.append(f"Top skills: {', '.join(top_skills)}\n")

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

    # 1. Fetch Tavily search results — review-site search + overview
    #    search run in parallel. The overview call is what powers the
    #    new ``description`` and ``products_for_you`` fields; without
    #    it the prompt would only see review-site content (Glassdoor /
    #    Blind / Reddit) and have nothing concrete to say about the
    #    company's products or business model.
    fetched_at = datetime.now(timezone.utc)
    review_results, overview_results = await asyncio.gather(
        search_company(
            company_name=company.name,
            domain=company.primary_domain,
        ),
        search_company_overview(
            company_name=company.name,
            domain=company.primary_domain,
        ),
    )
    logger.info(
        "Tavily returned %d review results + %d overview results for company %s",
        len(review_results),
        len(overview_results),
        company_id,
    )

    # 2. Load the user's profile context (resume summary + recent
    #    roles + top skills). None if the user has no resume content
    #    uploaded — the prompt then skips ``products_for_you``.
    user_context = await _build_user_context(db, user_id)

    # 3. Build context + call Claude. Both Tavily result sets feed
    #    the same prompt so Claude can correlate review-side signals
    #    against company-info signals (e.g. comp on Glassdoor + product
    #    info from the official site → personalised recommendation).
    review_context = _build_tavily_context(
        f"{company.name} (employee reviews)", list(review_results)
    )
    overview_context = _build_tavily_context(
        f"{company.name} (company overview)", list(overview_results)
    )
    context_parts = [review_context, "", overview_context]
    if user_context:
        context_parts += ["", user_context]
    else:
        context_parts += [
            "",
            "# User profile",
            "(no resume content uploaded — return null for products_for_you)",
        ]
    context = "\n".join(context_parts)
    raw: dict = await claude_service.call_claude(
        system_prompt=COMPANY_RESEARCH_PROMPT,
        user_content=context,
        context_type="company_research",
        context_id=company_id,
        user_id=user_id,
    )

    # 4. Map Claude output to DB fields.
    sentiment = _safe_sentiment(raw.get("sentiment"))

    # senior_engineer_sentiment lives in the model as the free-text analysis
    # field. We store Claude's culture_signals there.
    senior_engineer_sentiment = raw.get("culture_signals")

    # interview_process: not directly returned by Claude today; use headline
    # as a brief summary if present.
    interview_process = raw.get("summary")

    description = raw.get("description")
    products_for_you = raw.get("products_for_you")

    red_flags: list[str] = raw.get("red_flags") or []
    green_flags: list[str] = raw.get("green_flags") or []

    # Comp range: not returned by this prompt version; left null.
    reported_comp_range_min: float | None = None
    reported_comp_range_max: float | None = None
    comp_currency = "USD"
    comp_confidence = "unknown"

    if raw.get("compensation_signals"):
        comp_confidence = "low"

    # 5. Persist CompanyResearch.
    research = await company_research_repository.upsert_for_company(
        db,
        company_id=company_id,
        user_id=user_id,
        overall_sentiment=sentiment,
        senior_engineer_sentiment=senior_engineer_sentiment,
        interview_process=interview_process,
        description=description,
        products_for_you=products_for_you,
        red_flags=red_flags[:20],   # Enforce model constraint
        green_flags=green_flags[:20],
        reported_comp_range_min=reported_comp_range_min,
        reported_comp_range_max=reported_comp_range_max,
        comp_currency=comp_currency,
        comp_confidence=comp_confidence,
        raw_synthesis=raw,
    )

    # 6. Persist sources (review + overview combined; old ones deleted
    #    by the upsert path before this).
    all_results: list[dict] = list(review_results) + list(overview_results)
    source_dicts = [
        {
            "url": r["url"],
            "title": r.get("title"),
            "snippet": r.get("content"),
            "source_type": r["source_type"],
            "fetched_at": fetched_at,
        }
        for r in all_results
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
    # ``research.sources = sources`` LOOKS like it loads the relationship
    # but SQLAlchemy tracks load-state separately from the attribute
    # value. A plain assignment leaves the relationship marked as
    # un-loaded, so when Pydantic later accesses ``research.sources``
    # via ``from_attributes=True`` it triggers a lazy-load —
    # MissingGreenlet because Pydantic's getter is sync and async I/O
    # can't run there. ``set_committed_value`` writes the value AND
    # marks the relationship loaded, so subsequent access is a plain
    # attribute read with no DB hit.
    set_committed_value(research, "sources", sources)
    return research
