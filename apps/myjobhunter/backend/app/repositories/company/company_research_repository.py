"""CompanyResearch + ResearchSource repository.

All queries are tenant-scoped by user_id — never return data across users.

Functions:
  get_by_id               — single research record by PK + user_id
  get_by_company_id       — most recent research for a company (1:1 per schema)
  upsert_for_company      — create or replace the research record for a company
  create_sources          — bulk-insert ResearchSource rows for a research record
  list_sources_for_research — list all sources for a research record, user-scoped
  list_by_user            — all research records for a user
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company_research import CompanyResearch
from app.models.company.research_source import ResearchSource


async def get_by_id(
    db: AsyncSession,
    research_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    result = await db.execute(
        select(CompanyResearch).where(
            CompanyResearch.id == research_id,
            CompanyResearch.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_company_id(
    db: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    """Return the research record for a company, or None if not yet run."""
    result = await db.execute(
        select(CompanyResearch).where(
            CompanyResearch.company_id == company_id,
            CompanyResearch.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_for_company(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    overall_sentiment: str,
    senior_engineer_sentiment: str | None,
    interview_process: str | None,
    red_flags: list[str],
    green_flags: list[str],
    reported_comp_range_min: float | None,
    reported_comp_range_max: float | None,
    comp_currency: str,
    comp_confidence: str,
    raw_synthesis: dict | None,
) -> CompanyResearch:
    """Create or replace the CompanyResearch record for the given company.

    Because company_research is 1:1 with companies (UNIQUE on company_id),
    re-running research replaces the existing record's fields and deletes
    all prior sources (via cascade). New sources are written by
    ``create_sources`` immediately after.

    Does NOT commit — the caller (service layer) owns the transaction.
    """
    now = datetime.now(timezone.utc)

    existing = await get_by_company_id(db, company_id, user_id)
    if existing:
        existing.overall_sentiment = overall_sentiment
        existing.senior_engineer_sentiment = senior_engineer_sentiment
        existing.interview_process = interview_process
        existing.red_flags = red_flags
        existing.green_flags = green_flags
        existing.reported_comp_range_min = reported_comp_range_min
        existing.reported_comp_range_max = reported_comp_range_max
        existing.comp_currency = comp_currency
        existing.comp_confidence = comp_confidence
        existing.raw_synthesis = raw_synthesis
        existing.last_researched_at = now
        existing.updated_at = now
        db.add(existing)
        return existing

    record = CompanyResearch(
        user_id=user_id,
        company_id=company_id,
        overall_sentiment=overall_sentiment,
        senior_engineer_sentiment=senior_engineer_sentiment,
        interview_process=interview_process,
        red_flags=red_flags,
        green_flags=green_flags,
        reported_comp_range_min=reported_comp_range_min,
        reported_comp_range_max=reported_comp_range_max,
        comp_currency=comp_currency,
        comp_confidence=comp_confidence,
        raw_synthesis=raw_synthesis,
        last_researched_at=now,
    )
    db.add(record)
    await db.flush()  # Populate record.id before caller writes sources
    return record


async def create_sources(
    db: AsyncSession,
    *,
    research_id: uuid.UUID,
    user_id: uuid.UUID,
    sources: list[dict],
) -> list[ResearchSource]:
    """Bulk-insert ResearchSource rows for a research record.

    Each dict in ``sources`` must have keys: url, title, snippet, source_type, fetched_at.
    Does NOT commit — the caller owns the transaction.
    """
    rows: list[ResearchSource] = []
    for s in sources:
        row = ResearchSource(
            user_id=user_id,
            company_research_id=research_id,
            url=s["url"],
            title=s.get("title"),
            snippet=s.get("snippet"),
            source_type=s["source_type"],
            fetched_at=s["fetched_at"],
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def list_sources_for_research(
    db: AsyncSession,
    research_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ResearchSource]:
    """Return all sources for a research record, scoped by user_id."""
    result = await db.execute(
        select(ResearchSource).where(
            ResearchSource.company_research_id == research_id,
            ResearchSource.user_id == user_id,
        )
    )
    return list(result.scalars().all())


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[CompanyResearch]:
    result = await db.execute(
        select(CompanyResearch).where(CompanyResearch.user_id == user_id)
    )
    return list(result.scalars().all())
