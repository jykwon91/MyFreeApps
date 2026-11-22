"""Company research service — orchestrates Tavily → Claude → persistence.

Flow for POST /companies/{company_id}/research, in two calls so the route can
apply the per-user rate limit between them (a refused request spends no quota):

  ``claim_run`` (one short transaction)
  1. Verify the company exists and belongs to the requesting user, and claim
     its run by stamping ``companies.research_started_at``: a second request
     while one is in flight is refused, so the search and the AI call are
     never paid for twice.

  ``run_claimed_research`` (no connection held during the slow calls)
  2. Read the user's profile context in a short transaction.
  3. Call Tavily for recent web results about the company.
  4. Renew the claim, restarting its lease: if the run was taken over (or the
     company deleted) during the search, stop before paying for Claude.
  5. Call Claude (via claude_service.call_claude) to synthesise them into a
     structured JSON envelope.
  6. In a new transaction, re-read the company (locked): if it was deleted
     meanwhile, save nothing. Otherwise upsert the CompanyResearch row and
     write fresh ResearchSource rows (old ones cascade-deleted on upsert).
  7. Release the claim, whatever happened — shielded from cancellation, and
     a failure to release is logged, never raised over the run's own error.

Fail-loud:
  - TavilyNotConfiguredError → propagated to the route → HTTP 503.
  - ExtractionError (classified Anthropic failure) / ValueError from Claude
    → propagated → HTTP 502 with our own copy.
  - Company not found or wrong tenant (or deleted during the run) → None
    → route emits HTTP 404.
  - A run already in flight → ResearchAlreadyRunningError → HTTP 409.
"""
from __future__ import annotations

import asyncio
import dataclasses
import logging
import uuid
from datetime import datetime, timezone

import anyio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.company_research_constants import COMPANY_RESEARCH_CLAIM_LEASE
from app.db.session import unit_of_work
from app.models.company.company_research import CompanyResearch
from app.repositories.company import company_repository, company_research_repository
from app.repositories.profile import (
    profile_repository,
    skill_repository,
    work_history_repository,
)
from app.services.extraction import claude_service
from app.services.company.research_already_running_error import ResearchAlreadyRunningError
from app.services.company.research_run_claim import ResearchRunClaim
from app.services.company.research_search_results import ResearchSearchResults
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
            if w.is_current:
                end_label = "Present"
            elif w.end_date:
                end_label = w.end_date.isoformat()
            else:
                end_label = "end date unknown"
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


async def claim_run(
    *,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResearchRunClaim | None:
    """Claim a company's research run, in a short transaction of its own.

    Returns the claim, or None if the company is not found / belongs to another
    user. The claim is a timestamp on the company row, so no connection is held
    while the run waits on Tavily and Claude. ``run_claimed_research`` releases
    it; a caller that decides not to run must call ``release_run``.

    Raises:
        ResearchAlreadyRunningError: if another request is running this
            company's research (from another tab, device or worker).
    """
    claimed_at = datetime.now(timezone.utc)
    async with unit_of_work() as db:
        company = await company_repository.get_by_id(db, company_id, user_id)
        if company is None:
            return None
        claimed = await company_repository.try_claim_research(
            db,
            company_id,
            user_id,
            claimed_at=claimed_at,
            stale_before=claimed_at - COMPANY_RESEARCH_CLAIM_LEASE,
        )
        if not claimed:
            raise ResearchAlreadyRunningError
        return ResearchRunClaim(
            company_id=company.id,
            user_id=user_id,
            company_name=company.name,
            primary_domain=company.primary_domain,
            claimed_at=claimed_at,
        )


async def release_run(claim: ResearchRunClaim) -> None:
    """Give up a claim without running (e.g. the user is over their research quota)."""
    async with unit_of_work() as db:
        await company_repository.release_research_claim(
            db, claim.company_id, claim.user_id, claimed_at=claim.claimed_at,
        )


async def run_claimed_research(claim: ResearchRunClaim) -> CompanyResearch | None:
    """Run Tavily + Claude research for a run claimed by ``claim_run``, persist it, and release the claim.

    No database connection is open during the Tavily or Claude calls. The
    result is saved in a new transaction that first re-reads the company,
    locked: None (nothing saved) if it was deleted meanwhile.

    Raises:
        TavilyNotConfiguredError: if Tavily API key is missing in non-dev.
        platform_shared.extraction.ExtractionError: on Claude API failures.
        ValueError: if Claude returns malformed JSON.
        ResearchAlreadyRunningError: the claim expired and another run took
            the company over, so this result is not saved over that run's.
    """
    try:
        found = await _search(claim)
        renewed = await _renew_claim(claim)
        if renewed is None:
            return None
        claim = renewed
        return await _synthesise_and_save(claim, found)
    finally:
        # A client that disconnects cancels the request (Starlette's
        # BaseHTTPMiddleware does it through anyio); unshielded, the release
        # would be cancelled too and the company would read "already running"
        # until the lease ran out.
        with anyio.CancelScope(shield=True):
            await _release_after_run(claim)


async def _release_after_run(claim: ResearchRunClaim) -> None:
    """Release ``claim``, logging a failure rather than raising it over the run's own outcome.

    An unreleased claim only blocks the company until its lease expires.
    """
    try:
        await release_run(claim)
    except Exception:
        logger.exception("Could not release the research claim for company %s", claim.company_id)


async def _renew_claim(claim: ResearchRunClaim) -> ResearchRunClaim | None:
    """Restart the claim's lease before the Claude call.

    Returns the renewed claim, or None if the company was deleted meanwhile.

    Raises:
        ResearchAlreadyRunningError: the claim expired and another run took it.
    """
    renewed_at = datetime.now(timezone.utc)
    async with unit_of_work() as db:
        if await company_repository.renew_research_claim(
            db, claim.company_id, claim.user_id, claimed_at=claim.claimed_at, renewed_at=renewed_at,
        ):
            return dataclasses.replace(claim, claimed_at=renewed_at)
        if await company_repository.get_by_id(db, claim.company_id, claim.user_id) is None:
            logger.info("Company deleted while its research ran; not saved: company=%s", claim.company_id)
            return None
    raise ResearchAlreadyRunningError


async def _search(claim: ResearchRunClaim) -> ResearchSearchResults:
    # 1. Load the user's profile context (resume summary + recent roles +
    #    top skills) in a short read. None if the user has no resume content
    #    uploaded — the prompt then skips ``products_for_you``.
    async with unit_of_work() as db:
        user_context = await _build_user_context(db, claim.user_id)

    # 2. Fetch Tavily search results — review-site search + overview
    #    search run in parallel. The overview call is what powers the
    #    ``description`` and ``products_for_you`` fields; without it the
    #    prompt would only see review-site content (Glassdoor / Blind /
    #    Reddit) and have nothing concrete to say about the company's
    #    products or business model.
    fetched_at = datetime.now(timezone.utc)
    review_results, overview_results = await asyncio.gather(
        search_company(
            company_name=claim.company_name,
            domain=claim.primary_domain,
        ),
        search_company_overview(
            company_name=claim.company_name,
            domain=claim.primary_domain,
        ),
    )
    logger.info(
        "Tavily returned %d review results + %d overview results for company %s",
        len(review_results),
        len(overview_results),
        claim.company_id,
    )
    return ResearchSearchResults(
        user_context=user_context,
        review_results=list(review_results),
        overview_results=list(overview_results),
        fetched_at=fetched_at,
    )


async def _synthesise_and_save(
    claim: ResearchRunClaim, found: ResearchSearchResults,
) -> CompanyResearch | None:
    company_id = claim.company_id
    user_id = claim.user_id

    # 5. Build context + call Claude. Both Tavily result sets feed
    #    the same prompt so Claude can correlate review-side signals
    #    against company-info signals (e.g. comp on Glassdoor + product
    #    info from the official site → personalised recommendation).
    review_context = _build_tavily_context(
        f"{claim.company_name} (employee reviews)", list(found.review_results)
    )
    overview_context = _build_tavily_context(
        f"{claim.company_name} (company overview)", list(found.overview_results)
    )
    context_parts = [review_context, "", overview_context]
    if found.user_context:
        context_parts += ["", found.user_context]
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

    # 6. Persist in a new transaction, re-checking the company first: it may
    #    have been deleted, or (past the claim's lease) taken over by another run.
    async with unit_of_work() as db:
        company = await company_repository.get_by_id_for_update(db, company_id, user_id)
        if company is None:
            logger.info("Company deleted while its research ran; not saved: company=%s", company_id)
            return None
        if company.research_started_at != claim.claimed_at:
            raise ResearchAlreadyRunningError
        research = await _save_research(
            db, claim, raw, [*found.review_results, *found.overview_results], found.fetched_at,
        )

    logger.info(
        "Company research complete: company=%s research=%s sentiment=%s sources=%d",
        company_id,
        research.id,
        research.overall_sentiment,
        len(research.sources),
    )
    return research


async def _save_research(
    db: AsyncSession,
    claim: ResearchRunClaim,
    raw: dict,
    results: list[dict],
    fetched_at: datetime,
) -> CompanyResearch:
    """Upsert the research row and its sources, returned with sources loaded."""
    company_id = claim.company_id
    user_id = claim.user_id
    # Map Claude output to DB fields.
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

    # Sources: review + overview combined (old ones deleted by the upsert).
    source_dicts = [
        {
            "url": r["url"],
            "title": r.get("title"),
            "snippet": r.get("content"),
            "source_type": r["source_type"],
            "fetched_at": fetched_at,
        }
        for r in results
        if r.get("url")
    ]
    await company_research_repository.create_sources(
        db,
        research_id=research.id,
        user_id=user_id,
        sources=source_dicts,
    )
    sources = await company_research_repository.list_sources_for_research(
        db, research.id, user_id,
    )
    # Mark the relationship loaded (see ``get_research``) so the response
    # can read it after the session closes.
    set_committed_value(research, "sources", sources)
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
