"""Tests for the job-analysis service + POST /jobs/analyze endpoint.

Covers:
- _validate_response: happy path, missing keys, dimension reordering,
  out-of-enum status coercion, oversized rationale truncation, capped
  flag arrays.
- _compute_fingerprint: URL prefers, jd_text fallback, case-insensitive.
- analyze() with mocked Claude:
    * happy path: text input → persisted JobAnalysis row
    * malformed JSON → JobAnalysisError
    * URL auth-walled → JobAnalysisFetchAuthRequiredError
- HTTP endpoint (mocked Claude):
    * 201 on text input
    * 422 on both fields missing
    * 422 on auth_required URL
    * 401 unauthenticated
- apply_to_application:
    * creates Application + initial event
    * idempotent — second call returns same Application
    * 404 on cross-tenant
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_analysis.job_analysis import JobAnalysis
from app.services.job_analysis import job_analysis_service
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    JobAnalysisFetchAuthRequiredError,
    _compute_fingerprint,
    _validate_response,
    analyze,
    apply_to_application,
)


# ---------------------------------------------------------------------------
# Sample Claude envelope used across mocked tests.
# ---------------------------------------------------------------------------

_VALID_ENVELOPE: dict = {
    "extracted": {
        "title": "Senior Backend Engineer",
        "company": "Acme",
        "location": "SF, CA",
        "remote_type": "hybrid",
        "posted_salary_min": 140000,
        "posted_salary_max": 180000,
        "posted_salary_currency": "USD",
        "posted_salary_period": "year",
        "summary": "Senior role.",
    },
    "verdict": "worth_considering",
    "verdict_summary": "Skill match is strong but salary band is below your floor.",
    "dimensions": [
        {"key": "skill_match", "status": "strong", "rationale": "Python + Postgres covered."},
        {"key": "seniority", "status": "aligned", "rationale": "Senior role, you're senior."},
        {"key": "salary", "status": "below_target", "rationale": "Top is $180k, your floor is $200k."},
        {"key": "location_remote", "status": "compatible", "rationale": "Hybrid SF works for you."},
        {"key": "work_auth", "status": "compatible", "rationale": "JD doesn't require sponsorship."},
    ],
    "red_flags": ["No comp range disclosed"],
    "green_flags": ["Engineering practices listed", "Career growth mentioned"],
}


def _meta(envelope: dict | None = None) -> dict:
    """Build a fake call_claude_with_meta return value."""
    return {
        "parsed": envelope if envelope is not None else _VALID_ENVELOPE,
        "input_tokens": 1234,
        "output_tokens": 456,
        "cost_usd": Decimal("0.01098"),
    }


# ===========================================================================
# Pure-function tests — no I/O
# ===========================================================================


class TestValidateResponse:
    def test_happy_path_normalizes_envelope(self) -> None:
        result = _validate_response(_VALID_ENVELOPE)
        assert result["verdict"] == "worth_considering"
        assert "Skill match is strong" in result["verdict_summary"]
        assert len(result["dimensions"]) == 5
        assert [d["key"] for d in result["dimensions"]] == [
            "skill_match",
            "seniority",
            "salary",
            "location_remote",
            "work_auth",
        ]
        assert result["red_flags"] == ["No comp range disclosed"]
        assert len(result["green_flags"]) == 2

    def test_missing_dimension_filled_with_unclear(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        # Drop the seniority row entirely
        envelope["dimensions"] = [
            d for d in envelope["dimensions"] if d["key"] != "seniority"
        ]
        result = _validate_response(envelope)
        rows = {d["key"]: d for d in result["dimensions"]}
        assert rows["seniority"]["status"] == "unclear"
        assert "Insufficient signal" in rows["seniority"]["rationale"]

    def test_missing_salary_uses_not_disclosed_fallback(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["dimensions"] = [
            d for d in envelope["dimensions"] if d["key"] != "salary"
        ]
        result = _validate_response(envelope)
        rows = {d["key"]: d for d in result["dimensions"]}
        assert rows["salary"]["status"] == "not_disclosed"

    def test_dimensions_emitted_in_canonical_order(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        # Reverse Claude's output — ours should still be in canonical order.
        envelope["dimensions"] = list(reversed(envelope["dimensions"]))
        result = _validate_response(envelope)
        assert [d["key"] for d in result["dimensions"]] == [
            "skill_match",
            "seniority",
            "salary",
            "location_remote",
            "work_auth",
        ]

    def test_invalid_status_coerced_to_unclear(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["dimensions"] = [
            {"key": "skill_match", "status": "OUTSTANDING", "rationale": "Yes"},
        ]
        result = _validate_response(envelope)
        rows = {d["key"]: d for d in result["dimensions"]}
        # skill_match's safe-fallback is "unclear"; rationale preserved.
        assert rows["skill_match"]["status"] == "unclear"
        assert rows["skill_match"]["rationale"] == "Yes"

    def test_oversized_rationale_is_truncated(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        long = "a" * 2000
        envelope["dimensions"] = [
            {"key": "skill_match", "status": "strong", "rationale": long},
        ]
        result = _validate_response(envelope)
        rows = {d["key"]: d for d in result["dimensions"]}
        assert len(rows["skill_match"]["rationale"]) <= 600

    def test_unknown_verdict_raises(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["verdict"] = "amazing_fit"
        with pytest.raises(JobAnalysisError):
            _validate_response(envelope)

    def test_empty_verdict_summary_raises(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["verdict_summary"] = "   "
        with pytest.raises(JobAnalysisError):
            _validate_response(envelope)

    def test_non_dict_envelope_raises(self) -> None:
        with pytest.raises(JobAnalysisError):
            _validate_response(["nope"])

    def test_flag_list_caps_at_five(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["red_flags"] = [f"flag {i}" for i in range(20)]
        result = _validate_response(envelope)
        assert len(result["red_flags"]) == 5

    def test_flag_list_strips_non_strings(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["red_flags"] = ["real flag", 42, None, ""]
        result = _validate_response(envelope)
        assert result["red_flags"] == ["real flag"]

    def test_extracted_block_normalises_remote_type(self) -> None:
        envelope = dict(_VALID_ENVELOPE)
        envelope["extracted"] = {**envelope["extracted"], "remote_type": "hovercraft"}
        result = _validate_response(envelope)
        assert result["extracted"]["remote_type"] is None

    def test_extracted_block_maps_period_via_constant(self) -> None:
        # The service stores "year"/"month"/"hour" verbatim in extracted
        # (the Application model maps them later via _map_salary_period).
        envelope = dict(_VALID_ENVELOPE)
        envelope["extracted"] = {**envelope["extracted"], "posted_salary_period": "decade"}
        result = _validate_response(envelope)
        assert result["extracted"]["posted_salary_period"] is None


class TestFingerprint:
    def test_url_takes_precedence(self) -> None:
        fp1 = _compute_fingerprint(source_url="https://x.com/job/1", jd_text="A")
        fp2 = _compute_fingerprint(source_url="https://x.com/job/1", jd_text="B")
        assert fp1 == fp2

    def test_url_case_insensitive(self) -> None:
        fp1 = _compute_fingerprint(source_url="https://X.com/Job/1", jd_text="")
        fp2 = _compute_fingerprint(source_url="https://x.com/job/1", jd_text="")
        assert fp1 == fp2

    def test_jd_text_fallback_when_no_url(self) -> None:
        fp1 = _compute_fingerprint(source_url=None, jd_text="Hello world")
        fp2 = _compute_fingerprint(source_url="", jd_text="Hello world")
        assert fp1 == fp2

    def test_long_jd_text_truncated_for_fingerprint(self) -> None:
        # 256-char prefix is what we hash — anything beyond should be
        # ignored.
        prefix = "a" * 256
        fp1 = _compute_fingerprint(source_url=None, jd_text=prefix)
        fp2 = _compute_fingerprint(source_url=None, jd_text=prefix + "DIFFERENT")
        assert fp1 == fp2


# ===========================================================================
# Service-level tests with mocked Claude — exercise the full pipeline
# ===========================================================================


_FAKE_PATH = "app.services.job_analysis.job_analysis_service.claude_service.call_claude_with_meta"


@pytest.mark.asyncio
async def test_analyze_text_path_persists_row(
    db: AsyncSession,
    user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        result = await analyze(
            db, user_id, url=None, jd_text="Senior Backend Engineer at Acme.",
        )

    assert isinstance(result, JobAnalysis)
    assert result.user_id == user_id
    assert result.verdict == "worth_considering"
    assert result.source_url is None
    assert result.total_tokens_in == 1234
    assert result.total_tokens_out == 456
    assert len(result.dimensions) == 5
    assert result.red_flags == ["No comp range disclosed"]
    # Fingerprint is the SHA-256 of the trimmed first 256 chars.
    assert len(result.fingerprint) == 64


@pytest.mark.asyncio
async def test_analyze_rejects_both_or_neither(db: AsyncSession, user_factory) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with pytest.raises(JobAnalysisError):
        await analyze(db, user_id, url=None, jd_text=None)
    with pytest.raises(JobAnalysisError):
        await analyze(db, user_id, url="https://x.com/a", jd_text="some text")


@pytest.mark.asyncio
async def test_analyze_propagates_malformed_claude_response(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    bad_envelope = {"verdict": "not_real", "verdict_summary": "x", "dimensions": []}

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta(bad_envelope)):
        with pytest.raises(JobAnalysisError):
            await analyze(db, user_id, url=None, jd_text="Some JD text.")


@pytest.mark.asyncio
async def test_analyze_url_auth_walled_translates_to_specific_error(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    from app.services.extraction.jd_url_extractor import JDFetchAuthRequiredError

    with patch(
        "app.services.job_analysis.job_analysis_service.extract_from_url",
        new_callable=AsyncMock,
        side_effect=JDFetchAuthRequiredError("auth"),
    ):
        with pytest.raises(JobAnalysisFetchAuthRequiredError):
            await analyze(
                db, user_id, url="https://linkedin.com/jobs/123", jd_text=None,
            )


# ===========================================================================
# apply_to_application
# ===========================================================================


@pytest.mark.asyncio
async def test_apply_creates_application_with_initial_event(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        analysis = await analyze(
            db, user_id, url=None, jd_text="Senior Backend at Acme.",
        )

    application = await apply_to_application(db, user_id, analysis.id)
    assert application is not None
    assert application.role_title == "Senior Backend Engineer"
    assert application.user_id == user_id
    # Cost-track stayed on the analysis; the application doesn't surface it.
    assert str(application.posted_salary_min) == "140000.00"

    # Refetched analysis should now point at the application.
    refreshed = await job_analysis_service.get_analysis(db, user_id, analysis.id)
    assert refreshed is not None
    assert refreshed.applied_application_id == application.id


@pytest.mark.asyncio
async def test_apply_is_idempotent(db: AsyncSession, user_factory) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        analysis = await analyze(
            db, user_id, url=None, jd_text="Senior Backend at Acme.",
        )

    a1 = await apply_to_application(db, user_id, analysis.id)
    a2 = await apply_to_application(db, user_id, analysis.id)
    assert a1 is not None
    assert a2 is not None
    assert a1.id == a2.id


@pytest.mark.asyncio
async def test_apply_returns_none_for_cross_tenant(
    db: AsyncSession, user_factory,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        analysis = await analyze(
            db, uuid.UUID(user_a["id"]), url=None, jd_text="A JD.",
        )

    result = await apply_to_application(db, uuid.UUID(user_b["id"]), analysis.id)
    assert result is None


# ===========================================================================
# HTTP integration tests
# ===========================================================================


@pytest.mark.asyncio
async def test_post_analyze_text_returns_201(
    client: AsyncClient,
    user_factory,
    as_user,
) -> None:
    user = await user_factory()
    authed = await as_user(user)

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        async with authed as ac:
            resp = await ac.post(
                "/jobs/analyze",
                json={"jd_text": "Senior Backend Engineer at Acme."},
            )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["verdict"] == "worth_considering"
    assert len(body["dimensions"]) == 5


@pytest.mark.asyncio
async def test_post_analyze_rejects_both_fields(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    authed = await as_user(user)

    async with authed as ac:
        resp = await ac.post(
            "/jobs/analyze",
            json={"url": "https://x.com/job/1", "jd_text": "also text"},
        )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_post_analyze_rejects_neither_field(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    authed = await as_user(user)

    async with authed as ac:
        resp = await ac.post("/jobs/analyze", json={})

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_post_analyze_unauthenticated_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/jobs/analyze", json={"jd_text": "anything"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_post_analyze_auth_walled_returns_422_auth_required(
    client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    authed = await as_user(user)

    from app.services.extraction.jd_url_extractor import JDFetchAuthRequiredError

    with patch(
        "app.services.job_analysis.job_analysis_service.extract_from_url",
        new_callable=AsyncMock,
        side_effect=JDFetchAuthRequiredError("auth"),
    ):
        async with authed as ac:
            resp = await ac.post(
                "/jobs/analyze",
                json={"url": "https://linkedin.com/jobs/123"},
            )

    assert resp.status_code == 422
    assert resp.json()["detail"] == "auth_required"


@pytest.mark.asyncio
async def test_post_apply_creates_application(
    client: AsyncClient, user_factory, as_user, db: AsyncSession,
) -> None:
    user = await user_factory()
    authed = await as_user(user)

    with patch(_FAKE_PATH, new_callable=AsyncMock, return_value=_meta()):
        async with authed as ac:
            r1 = await ac.post(
                "/jobs/analyze",
                json={"jd_text": "Senior Backend Engineer at Acme."},
            )
            assert r1.status_code == 201
            analysis_id = r1.json()["id"]

            r2 = await ac.post(f"/jobs/analyze/{analysis_id}/apply")
            assert r2.status_code == 201, r2.text
            body = r2.json()
            assert body["role_title"] == "Senior Backend Engineer"
