"""Tests for JD parsing service + POST /applications/parse-jd endpoint.

Covers:
- Happy path: Claude returns valid JSON → parsed fields returned correctly.
- Claude failure propagates as JdParseError.
- Normalisation: invalid remote_type / seniority / salary_period are nulled.
- Salary period mapping: "year" → "annual", "month" → "monthly", "hour" → "hourly".
- HTTP endpoint: 200 on success, 502 when parse_jd raises JdParseError,
  401 for unauthenticated, 422 for missing jd_text.
- Tenant isolation: the endpoint scopes the extraction_log by user_id
  (verified indirectly — the service receives the correct user_id).

No real Claude API calls are made — all tests mock ``claude_service.call_claude``
at the service layer boundary.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.application.jd_parsing_service import (
    JdParseError,
    JdParseResult,
    _normalise,
    parse_jd,
)


# ---------------------------------------------------------------------------
# Unit tests for _normalise() — no I/O
# ---------------------------------------------------------------------------


class TestNormalise:
    def test_happy_path_all_fields(self) -> None:
        raw = {
            "title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "location": "San Francisco, CA",
            "remote_type": "hybrid",
            "salary_min": 140000,
            "salary_max": 180000,
            "salary_currency": "USD",
            "salary_period": "year",
            "seniority": "senior",
            "must_have_requirements": ["Python", "PostgreSQL", "5+ years experience"],
            "nice_to_have_requirements": ["Kubernetes", "GraphQL"],
            "responsibilities": ["Build APIs", "Review PRs"],
            "summary": "Great senior role at a fast-growing startup.",
        }
        result = _normalise(raw)

        assert result.title == "Senior Backend Engineer"
        assert result.company == "Acme Corp"
        assert result.location == "San Francisco, CA"
        assert result.remote_type == "hybrid"
        assert result.salary_min == 140000.0
        assert result.salary_max == 180000.0
        assert result.salary_currency == "USD"
        assert result.salary_period == "annual"  # "year" → "annual"
        assert result.seniority == "senior"
        assert result.must_have_requirements == ["Python", "PostgreSQL", "5+ years experience"]
        assert result.nice_to_have_requirements == ["Kubernetes", "GraphQL"]
        assert result.responsibilities == ["Build APIs", "Review PRs"]
        assert result.summary == "Great senior role at a fast-growing startup."

    def test_all_nulls_returned_as_none_or_empty_list(self) -> None:
        result = _normalise({})

        assert result.title is None
        assert result.company is None
        assert result.location is None
        assert result.remote_type is None
        assert result.salary_min is None
        assert result.salary_max is None
        assert result.salary_currency is None
        assert result.salary_period is None
        assert result.seniority is None
        assert result.must_have_requirements == []
        assert result.nice_to_have_requirements == []
        assert result.responsibilities == []
        assert result.summary is None

    def test_invalid_remote_type_becomes_null(self) -> None:
        raw = {"remote_type": "hovercraft"}
        result = _normalise(raw)
        assert result.remote_type is None

    def test_invalid_seniority_becomes_null(self) -> None:
        raw = {"seniority": "ninja"}
        result = _normalise(raw)
        assert result.seniority is None

    def test_salary_period_mapping(self) -> None:
        for prompt_val, stored_val in [("year", "annual"), ("month", "monthly"), ("hour", "hourly")]:
            result = _normalise({"salary_period": prompt_val})
            assert result.salary_period == stored_val

    def test_unknown_salary_period_becomes_null(self) -> None:
        result = _normalise({"salary_period": "decade"})
        assert result.salary_period is None

    def test_negative_salary_becomes_null(self) -> None:
        result = _normalise({"salary_min": -5000, "salary_max": -1})
        assert result.salary_min is None
        assert result.salary_max is None

    def test_salary_as_string_numbers_coerced(self) -> None:
        result = _normalise({"salary_min": "120000", "salary_max": "160000"})
        assert result.salary_min == 120000.0
        assert result.salary_max == 160000.0

    def test_non_string_salary_handled(self) -> None:
        result = _normalise({"salary_min": None, "salary_max": "n/a"})
        assert result.salary_min is None
        assert result.salary_max is None

    def test_list_items_capped_at_max(self) -> None:
        long_list = [f"item {i}" for i in range(30)]
        result = _normalise({"must_have_requirements": long_list})
        assert len(result.must_have_requirements) == 20

    def test_non_list_requirements_returns_empty(self) -> None:
        result = _normalise({"must_have_requirements": "Python, Postgres"})
        assert result.must_have_requirements == []

    def test_whitespace_only_strings_become_null(self) -> None:
        result = _normalise({"title": "   ", "company": "\t\n"})
        assert result.title is None
        assert result.company is None

    def test_currency_trimmed_to_3_chars_and_uppercased(self) -> None:
        result = _normalise({"salary_currency": "usd_extra"})
        assert result.salary_currency == "USD"

    def test_to_dict_roundtrip(self) -> None:
        raw = {
            "title": "Engineer",
            "company": "Co",
            "location": None,
            "remote_type": "remote",
            "salary_min": 100000,
            "salary_max": None,
            "salary_currency": "EUR",
            "salary_period": "month",
            "seniority": "mid",
            "must_have_requirements": ["Python"],
            "nice_to_have_requirements": [],
            "responsibilities": ["Build stuff"],
            "summary": "A role.",
        }
        result = _normalise(raw)
        d = result.to_dict()
        assert d["title"] == "Engineer"
        assert d["salary_period"] == "monthly"
        assert d["salary_currency"] == "EUR"


# ---------------------------------------------------------------------------
# Unit tests for parse_jd() — mocks call_claude
# ---------------------------------------------------------------------------


SAMPLE_JD = """\
Company: Acme Corp
Role: Senior Backend Engineer (Hybrid, San Francisco)
Salary: $140,000 – $180,000 per year

Requirements:
- 5+ years Python
- PostgreSQL
- Nice to have: Kubernetes

Responsibilities:
- Build APIs
- Review PRs
"""

_SAMPLE_RAW = {
    "title": "Senior Backend Engineer",
    "company": "Acme Corp",
    "location": "San Francisco",
    "remote_type": "hybrid",
    "salary_min": 140000,
    "salary_max": 180000,
    "salary_currency": "USD",
    "salary_period": "year",
    "seniority": "senior",
    "must_have_requirements": ["5+ years Python", "PostgreSQL"],
    "nice_to_have_requirements": ["Kubernetes"],
    "responsibilities": ["Build APIs", "Review PRs"],
    "summary": "Senior backend role at Acme Corp.",
}


class TestParseJd:
    @pytest.mark.asyncio
    async def test_happy_path_returns_result(self) -> None:
        user_id = uuid.uuid4()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            return_value=_SAMPLE_RAW,
        ) as mock_call:
            result = await parse_jd(SAMPLE_JD, user_id)

        mock_call.assert_called_once_with(
            system_prompt=pytest.approx(mock_call.call_args.kwargs["system_prompt"]),
            user_content=SAMPLE_JD,
            context_type="jd_parse",
            user_id=user_id,
            context_id=None,
        )
        assert result.title == "Senior Backend Engineer"
        assert result.company == "Acme Corp"
        assert result.salary_period == "annual"

    @pytest.mark.asyncio
    async def test_passes_application_id_as_context_id(self) -> None:
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            return_value=_SAMPLE_RAW,
        ) as mock_call:
            await parse_jd(SAMPLE_JD, user_id, application_id=app_id)

        assert mock_call.call_args.kwargs["context_id"] == app_id

    @pytest.mark.asyncio
    async def test_claude_api_error_raises_jd_parse_error(self) -> None:
        import anthropic

        user_id = uuid.uuid4()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            side_effect=anthropic.APIConnectionError(request=None),
        ):
            with pytest.raises(JdParseError, match="Claude extraction failed"):
                await parse_jd(SAMPLE_JD, user_id)

    @pytest.mark.asyncio
    async def test_invalid_json_raises_jd_parse_error(self) -> None:
        user_id = uuid.uuid4()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            side_effect=ValueError("Claude returned invalid JSON"),
        ):
            with pytest.raises(JdParseError, match="Claude extraction failed"):
                await parse_jd(SAMPLE_JD, user_id)


# ---------------------------------------------------------------------------
# HTTP endpoint tests via FastAPI TestClient
# ---------------------------------------------------------------------------


class TestParseJdEndpoint:
    @pytest.mark.asyncio
    async def test_parse_jd_happy_path_returns_200(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            return_value=_SAMPLE_RAW,
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/parse-jd",
                    json={"jd_text": SAMPLE_JD},
                )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Senior Backend Engineer"
        assert body["company"] == "Acme Corp"
        assert body["salary_min"] == 140000.0
        assert body["salary_max"] == 180000.0
        assert body["salary_period"] == "annual"
        assert body["remote_type"] == "hybrid"
        assert body["seniority"] == "senior"
        assert "Python" in body["must_have_requirements"][0]
        assert body["summary"] is not None

    @pytest.mark.asyncio
    async def test_parse_jd_claude_failure_returns_502(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            side_effect=ValueError("bad json"),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/parse-jd",
                    json={"jd_text": SAMPLE_JD},
                )

        assert resp.status_code == 502, resp.text
        assert "JD parsing failed" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_parse_jd_unauthenticated_returns_401(self, client) -> None:
        resp = await client.post(
            "/applications/parse-jd",
            json={"jd_text": SAMPLE_JD},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_parse_jd_empty_text_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/parse-jd",
                json={"jd_text": ""},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_parse_jd_missing_body_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/applications/parse-jd", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_parse_jd_extra_fields_rejected_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/parse-jd",
                json={"jd_text": SAMPLE_JD, "evil_field": "x"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_parse_jd_null_fields_forwarded(
        self, user_factory, as_user,
    ) -> None:
        """Claude may return partial results — null fields should pass through."""
        user = await user_factory()
        partial_raw = {
            "title": "Engineer",
            "company": None,
            "location": None,
            "remote_type": None,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "salary_period": None,
            "seniority": None,
            "must_have_requirements": [],
            "nice_to_have_requirements": [],
            "responsibilities": [],
            "summary": None,
        }

        with patch(
            "app.services.application.jd_parsing_service.claude_service.call_claude",
            new_callable=AsyncMock,
            return_value=partial_raw,
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/parse-jd",
                    json={"jd_text": SAMPLE_JD},
                )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Engineer"
        assert body["company"] is None
        assert body["salary_min"] is None
        assert body["must_have_requirements"] == []
