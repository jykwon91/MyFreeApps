"""Tests for the extracted ``score()`` entrypoint of job_analysis_service.

``score()`` is the pure JD-text-in / JobAnalysis-out function that both
``analyze()`` (paste-URL flow) and the discovery score worker call. It
is the seam where /analyze and discovery converge — these tests pin
the contract:

- jd_text required and non-empty
- source_url is optional and persisted on the row
- extracted_hint merges over Claude's ``extracted`` block (hint wins
  for fields it provides; Claude wins for fields the hint omits)
- discovered_job_id is passed through to the extraction_log via
  ``context_id``

The existing ``test_job_analysis_service.py`` continues to cover
``analyze()`` end-to-end.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.job_analysis.job_analysis import JobAnalysis
from app.services.job_analysis import job_analysis_service
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    score,
)


_FAKE_PATH = (
    "app.services.job_analysis.job_analysis_service"
    ".claude_service.call_claude_with_meta"
)


def _meta(**overrides) -> dict:
    """Mock a successful Claude call envelope."""
    base = {
        "input_tokens": 1200,
        "output_tokens": 400,
        "cost_usd": 0.005,
        "parsed": {
            "verdict": "worth_considering",
            "verdict_summary": "Reasonable fit overall — Python experience aligns.",
            "extracted": {
                "title": "Senior Backend Engineer",
                "company": "Acme",
                "location": "Remote",
                "remote_type": "remote",
                "posted_salary_min": 150000,
                "posted_salary_max": 200000,
                "posted_salary_currency": "USD",
                "posted_salary_period": "year",
                "summary": "Backend role at Acme.",
            },
            "dimensions": [
                {"key": "skill_match", "status": "strong", "rationale": "ok"},
                {"key": "seniority", "status": "aligned", "rationale": "ok"},
                {"key": "salary", "status": "in_range", "rationale": "ok"},
                {"key": "location_remote", "status": "compatible", "rationale": "ok"},
                {"key": "work_auth", "status": "compatible", "rationale": "ok"},
            ],
            "red_flags": [],
            "green_flags": ["Strong stack overlap"],
        },
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_score_persists_row_with_jd_text_only(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme. Python required.",
        )

    assert isinstance(result, JobAnalysis)
    assert result.user_id == user_id
    assert result.jd_text.startswith("Senior Backend Engineer")
    assert result.source_url is None
    assert result.verdict == "worth_considering"


@pytest.mark.asyncio
async def test_score_persists_source_url_when_provided(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
            source_url="https://www.linkedin.com/jobs/view/123",
        )

    assert result.source_url == "https://www.linkedin.com/jobs/view/123"


@pytest.mark.asyncio
async def test_score_rejects_empty_jd_text(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with pytest.raises(JobAnalysisError):
        await score(db, user_id, jd_text="")

    with pytest.raises(JobAnalysisError):
        await score(db, user_id, jd_text="   ")


@pytest.mark.asyncio
async def test_score_extracted_hint_overrides_claude_for_provided_fields(
    db: AsyncSession, user_factory,
) -> None:
    """The discovery worker passes structural fields it already has from
    the source API (title, company). Those should NOT be overwritten by
    Claude's parsed extraction — Claude is for analysis, not re-extraction."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    hint = {
        "title": "Staff Software Engineer",
        "company": "Stripe",
        "location": "San Francisco, CA",
    }

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme. Python required.",
            extracted_hint=hint,
        )

    # Hint values win for fields it provides.
    assert result.extracted["title"] == "Staff Software Engineer"
    assert result.extracted["company"] == "Stripe"
    assert result.extracted["location"] == "San Francisco, CA"
    # Claude wins for fields the hint omits.
    assert result.extracted["remote_type"] == "remote"
    assert result.extracted["posted_salary_min"] == 150000


@pytest.mark.asyncio
async def test_score_extracted_hint_with_none_values_does_not_override(
    db: AsyncSession, user_factory,
) -> None:
    """Hint values that are None should NOT clobber Claude's extraction —
    None means 'caller didn't provide this'."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    hint = {"title": None, "company": "Stripe"}

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
            extracted_hint=hint,
        )

    # title is None in hint → Claude's value wins
    assert result.extracted["title"] == "Senior Backend Engineer"
    # company is set in hint → hint wins
    assert result.extracted["company"] == "Stripe"


@pytest.mark.asyncio
async def test_score_passes_discovered_job_id_to_extraction_log(
    db: AsyncSession, user_factory,
) -> None:
    """The discovery worker passes discovered_job_id; we forward it to
    the extraction_log via context_id so per-feature cost rollups can
    join discovered_jobs ↔ extraction_logs."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    fake_discovered_id = uuid.uuid4()

    mock = AsyncMock(return_value=_meta())
    with patch(_FAKE_PATH, new=mock):
        await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
            discovered_job_id=fake_discovered_id,
        )

    # Verify context_id was forwarded to claude_service.
    assert mock.await_count == 1
    kwargs = mock.await_args.kwargs
    assert kwargs["context_id"] == fake_discovered_id


@pytest.mark.asyncio
async def test_analyze_text_path_still_works_after_refactor(
    db: AsyncSession, user_factory,
) -> None:
    """Sanity check: analyze() with jd_text still produces the same shape
    as before the score() extraction. This pins the refactor."""
    from app.services.job_analysis.job_analysis_service import analyze

    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await analyze(
            db,
            user_id,
            url=None,
            jd_text="Senior Backend Engineer at Acme.",
        )

    assert isinstance(result, JobAnalysis)
    assert result.user_id == user_id
    assert result.source_url is None
    assert result.verdict == "worth_considering"


@pytest.mark.asyncio
async def test_score_with_discovered_job_sets_score_fields_atomically(
    db: AsyncSession, user_factory,
) -> None:
    """score() with discovered_job= writes score, score_reason, and scored_at
    on the DiscoveredJob in the same commit as the JobAnalysis row.

    This is the single-commit guarantee: before this refactor the worker
    committed the JobAnalysis first then wrote discovered_job.score in a
    separate transaction. A process crash between those two commits would
    leave discovered_job.score = NULL while the cost record already existed,
    causing a re-bill on the next refresh cycle.
    """
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id="test-ext-id-score-atomic",
        title="Senior Backend Engineer",
        company_name="Acme",
        remote_type="remote",
    )
    db.add(job)
    await db.flush()

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        analysis = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme. Python required.",
            discovered_job=job,
        )

    assert isinstance(analysis, JobAnalysis)
    assert analysis.verdict == "worth_considering"

    # The DiscoveredJob must have all three score fields set in the same commit.
    assert job.score is not None, "discovered_job.score must be set"
    assert job.score_reason is not None, "discovered_job.score_reason must be set"
    assert job.scored_at is not None, "discovered_job.scored_at must be set"

    # verdict → score mapping: "worth_considering" maps to 70.
    assert job.score == 70
    assert job.score_reason == analysis.verdict_summary


@pytest.mark.asyncio
async def test_score_without_discovered_job_leaves_no_score_fields(
    db: AsyncSession, user_factory,
) -> None:
    """score() called without discovered_job= (the analyze-from-URL / paste-text
    flow) must NOT touch any DiscoveredJob row — the parameter is opt-in only."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            db,
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
        )

    # No exception, normal analysis persisted.
    assert isinstance(result, JobAnalysis)
    assert result.verdict == "worth_considering"
