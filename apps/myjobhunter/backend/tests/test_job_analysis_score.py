"""Tests for the extracted ``score()`` entrypoint of job_analysis_service.

``score()`` is the pure JD-text-in / JobAnalysis-out function that both
``analyze()`` (paste-URL flow) and the discovery score worker call. It
is the seam where /analyze and discovery converge — these tests pin
the contract:

- jd_text required and non-empty
- source_url is optional and persisted on the row
- extracted_hint merges over Claude's ``extracted`` block (hint wins
  for fields it provides; Claude wins for fields the hint omits)
- score_discovered_job logs the Claude call against the posting
  (``context_id``) and saves the analysis + the posting's score together
- no database connection is held while Claude runs, and a posting removed
  or scored by another pass meanwhile gets nothing saved

The existing ``test_job_analysis_service.py`` continues to cover
``analyze()`` end-to-end.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine as app_engine
from app.db.session import unit_of_work
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.job_analysis.job_analysis import JobAnalysis
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    score,
    score_discovered_job,
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
        await score(user_id, jd_text="")

    with pytest.raises(JobAnalysisError):
        await score(user_id, jd_text="   ")


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
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
            extracted_hint=hint,
        )

    # title is None in hint → Claude's value wins
    assert result.extracted["title"] == "Senior Backend Engineer"
    # company is set in hint → hint wins
    assert result.extracted["company"] == "Stripe"


async def _add_discovered_job(db: AsyncSession, user_id: uuid.UUID, ext_id: str) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=ext_id,
        title="Senior Backend Engineer",
        company_name="Acme",
        remote_type="remote",
    )
    db.add(job)
    await db.commit()
    return job


async def _analysis_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(JobAnalysis).where(JobAnalysis.user_id == user_id),
    )
    return int(result.scalar_one())


def _claude_seeing_no_open_connection(checks: list[int]) -> AsyncMock:
    """A fake Claude that records how many app DB connections are checked out."""

    async def _call(**_: object) -> dict:
        checks.append(app_engine.pool.checkedout())
        return _meta()

    return AsyncMock(side_effect=_call)


@pytest.mark.asyncio
async def test_score_holds_no_database_connection_while_claude_runs(
    db: AsyncSession, user_factory,
) -> None:
    """The profile read closes before Claude is called; the save opens after."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    checks: list[int] = []

    with patch(_FAKE_PATH, new=_claude_seeing_no_open_connection(checks)):
        result = await score(user_id, jd_text="Senior Backend Engineer at Acme.")

    assert checks == [0]
    assert await _analysis_count(db, user_id) == 1
    assert result.verdict == "worth_considering"


@pytest.mark.asyncio
async def test_score_discovered_job_holds_no_database_connection_while_claude_runs(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _add_discovered_job(db, user_id, "ext-no-conn")
    checks: list[int] = []

    with patch(_FAKE_PATH, new=_claude_seeing_no_open_connection(checks)):
        await score_discovered_job(
            user_id, job.id, jd_text="Senior Backend Engineer.", source_url=None, extracted_hint=None,
        )

    assert checks == [0]


@pytest.mark.asyncio
async def test_score_discovered_job_logs_claude_call_against_the_posting(
    db: AsyncSession, user_factory,
) -> None:
    """The posting id is the extraction_log ``context_id``, so per-feature
    cost rollups can join discovered_jobs and extraction_logs."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _add_discovered_job(db, user_id, "ext-context-id")

    mock = AsyncMock(return_value=_meta())
    with patch(_FAKE_PATH, new=mock):
        await score_discovered_job(
            user_id, job.id, jd_text="Senior Backend Engineer.", source_url=None, extracted_hint=None,
        )

    assert mock.await_count == 1
    assert mock.await_args.kwargs["context_id"] == job.id


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
            user_id,
            url=None,
            jd_text="Senior Backend Engineer at Acme.",
        )

    assert isinstance(result, JobAnalysis)
    assert result.user_id == user_id
    assert result.source_url is None
    assert result.verdict == "worth_considering"


@pytest.mark.asyncio
async def test_score_discovered_job_saves_analysis_and_score_in_one_commit(
    db: AsyncSession, user_factory,
) -> None:
    """The analysis row and the posting's score, score_reason and scored_at
    commit together, so a crash can't leave a paid-for analysis with the
    posting still unscored (which would re-bill on the next refresh)."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _add_discovered_job(db, user_id, "test-ext-id-score-atomic")

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        analysis = await score_discovered_job(
            user_id,
            job.id,
            jd_text="Senior Backend Engineer at Acme. Python required.",
            source_url=None,
            extracted_hint=None,
        )

    assert analysis is not None
    await db.refresh(job)
    # verdict → score mapping: "worth_considering" maps to 70.
    assert job.score == 70
    assert job.score_reason == analysis.verdict_summary
    assert job.scored_at is not None
    assert await _analysis_count(db, user_id) == 1


@pytest.mark.asyncio
async def test_score_discovered_job_saves_nothing_when_posting_deleted_meanwhile(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _add_discovered_job(db, user_id, "ext-deleted-mid-call")

    async def _claude_while_posting_is_deleted(**_: object) -> dict:
        async with unit_of_work() as other:
            await other.execute(delete(DiscoveredJob).where(DiscoveredJob.id == job.id))
        return _meta()

    with patch(_FAKE_PATH, new=AsyncMock(side_effect=_claude_while_posting_is_deleted)):
        result = await score_discovered_job(
            user_id, job.id, jd_text="Senior Backend Engineer.", source_url=None, extracted_hint=None,
        )

    assert result is None
    assert await _analysis_count(db, user_id) == 0


@pytest.mark.asyncio
async def test_score_discovered_job_keeps_the_first_score_when_another_pass_finished_first(
    db: AsyncSession, user_factory,
) -> None:
    """Two passes scoring the same posting: the second to finish saves nothing."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _add_discovered_job(db, user_id, "ext-scored-mid-call")

    async def _claude_while_another_pass_scores(**_: object) -> dict:
        async with unit_of_work() as other:
            await other.execute(
                update(DiscoveredJob)
                .where(DiscoveredJob.id == job.id)
                .values(score=15, score_reason="first pass", scored_at=func.now()),
            )
        return _meta()

    with patch(_FAKE_PATH, new=AsyncMock(side_effect=_claude_while_another_pass_scores)):
        result = await score_discovered_job(
            user_id, job.id, jd_text="Senior Backend Engineer.", source_url=None, extracted_hint=None,
        )

    assert result is None
    await db.refresh(job)
    assert (job.score, job.score_reason) == (15, "first pass")
    assert await _analysis_count(db, user_id) == 0


@pytest.mark.asyncio
async def test_score_without_discovered_job_leaves_no_score_fields(
    db: AsyncSession, user_factory,
) -> None:
    """score() (the analyze-from-URL / paste-text flow) must NOT touch any
    DiscoveredJob row — only score_discovered_job writes one."""
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await score(
            user_id,
            jd_text="Senior Backend Engineer at Acme.",
        )

    # No exception, normal analysis persisted.
    assert isinstance(result, JobAnalysis)
    assert result.verdict == "worth_considering"
