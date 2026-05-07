"""Tests for the company research service.

Covers:
- Happy path: Tavily + Claude mocked, research record persisted, sources written.
- Tenant isolation: wrong user_id returns None.
- Unknown company returns None.
- Claude returning malformed JSON raises ValueError.
- Sentinel sentinel: existing research is updated (upsert), not duplicated.

These tests use the standard conftest DB fixtures and roll back after each test.
Tavily and Claude calls are mocked so no real network calls are made.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.repositories.company import company_research_repository


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_company_payload(**overrides) -> dict:
    payload = {
        "name": "Research Corp",
        "primary_domain": "research.example.com",
        "industry": "SaaS",
    }
    payload.update(overrides)
    return payload


MOCK_TAVILY_RESULTS = [
    {
        "url": "https://glassdoor.com/reviews/research-corp",
        "title": "Research Corp Reviews",
        "content": "Great company, excellent benefits, good work-life balance.",
        "score": 0.92,
        "source_type": "glassdoor",
    },
    {
        "url": "https://reddit.com/r/cscareerquestions/research-corp",
        "title": "Research Corp on Reddit",
        "content": "Pay is competitive. Engineering culture is strong.",
        "score": 0.78,
        "source_type": "reddit",
    },
]

MOCK_CLAUDE_RESPONSE = {
    "summary": "Research Corp is well-regarded with positive reviews on most platforms.",
    "sentiment": "positive",
    "compensation_signals": "Salary ranges above market rate, competitive equity.",
    "culture_signals": "Collaborative engineering culture with strong work-life balance.",
    "red_flags": ["Some reports of slow promotion cycles"],
    "green_flags": ["Competitive pay", "Good benefits", "Positive Glassdoor rating"],
    "headline": "Strong employer with competitive comp and good culture.",
}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestCompanyResearchServiceHappyPath:
    @pytest.mark.asyncio
    async def test_run_research_creates_record_and_sources(
        self,
        user_factory,
        as_user,
        db: AsyncSession,
    ) -> None:
        """run_research persists a CompanyResearch + ResearchSource rows."""
        user = await user_factory()

        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json=_make_company_payload())
            assert resp.status_code == 201
            company_id = uuid.UUID(resp.json()["id"])

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(return_value=MOCK_CLAUDE_RESPONSE),
            ),
        ):
            from app.services.company import company_research_service

            research = await company_research_service.run_research(
                db,
                company_id=company_id,
                user_id=uuid.UUID(user["id"]),
            )

        assert research is not None
        assert research.overall_sentiment == "positive"
        assert research.company_id == company_id
        assert research.user_id == uuid.UUID(user["id"])
        assert "Collaborative" in (research.senior_engineer_sentiment or "")
        assert research.green_flags == MOCK_CLAUDE_RESPONSE["green_flags"]
        assert research.red_flags == MOCK_CLAUDE_RESPONSE["red_flags"]

        # Sources were persisted
        sources = await company_research_repository.list_sources_for_research(
            db, research.id, uuid.UUID(user["id"])
        )
        assert len(sources) == 2
        urls = {s.url for s in sources}
        assert "https://glassdoor.com/reviews/research-corp" in urls
        assert "https://reddit.com/r/cscareerquestions/research-corp" in urls

    @pytest.mark.asyncio
    async def test_run_research_upserts_on_second_call(
        self,
        user_factory,
        as_user,
        db: AsyncSession,
    ) -> None:
        """Second run_research call replaces the first record."""
        user = await user_factory()

        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json=_make_company_payload())
            assert resp.status_code == 201
            company_id = uuid.UUID(resp.json()["id"])

        from app.services.company import company_research_service

        first_response = {**MOCK_CLAUDE_RESPONSE, "sentiment": "mixed"}
        second_response = {**MOCK_CLAUDE_RESPONSE, "sentiment": "positive"}

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(side_effect=[first_response, second_response]),
            ),
        ):
            r1 = await company_research_service.run_research(
                db, company_id=company_id, user_id=uuid.UUID(user["id"])
            )
            r2 = await company_research_service.run_research(
                db, company_id=company_id, user_id=uuid.UUID(user["id"])
            )

        assert r1 is not None
        assert r2 is not None
        # Same PK — upserted in place
        assert r1.id == r2.id
        assert r2.overall_sentiment == "positive"


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


class TestCompanyResearchTenantIsolation:
    @pytest.mark.asyncio
    async def test_run_research_wrong_user_returns_none(
        self,
        user_factory,
        as_user,
        db: AsyncSession,
    ) -> None:
        """run_research returns None when user_id doesn't own the company."""
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed:
            resp = await authed.post("/companies", json=_make_company_payload())
            assert resp.status_code == 201
            company_id = uuid.UUID(resp.json()["id"])

        from app.services.company import company_research_service

        result = await company_research_service.run_research(
            db,
            company_id=company_id,
            user_id=uuid.UUID(attacker["id"]),
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_run_research_unknown_company_returns_none(
        self,
        user_factory,
        db: AsyncSession,
    ) -> None:
        """run_research returns None when company_id doesn't exist."""
        user = await user_factory()

        from app.services.company import company_research_service

        result = await company_research_service.run_research(
            db,
            company_id=uuid.uuid4(),
            user_id=uuid.UUID(user["id"]),
        )

        assert result is None


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestCompanyResearchServiceErrors:
    @pytest.mark.asyncio
    async def test_run_research_propagates_claude_value_error(
        self,
        user_factory,
        as_user,
        db: AsyncSession,
    ) -> None:
        """ValueError from Claude is re-raised so the route can map it to 502."""
        user = await user_factory()

        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json=_make_company_payload())
            assert resp.status_code == 201
            company_id = uuid.UUID(resp.json()["id"])

        from app.services.company import company_research_service

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(side_effect=ValueError("Claude returned invalid JSON")),
            ),
        ):
            with pytest.raises(ValueError, match="Claude returned invalid JSON"):
                await company_research_service.run_research(
                    db,
                    company_id=company_id,
                    user_id=uuid.UUID(user["id"]),
                )


# ---------------------------------------------------------------------------
# GET research endpoint
# ---------------------------------------------------------------------------


class TestGetCompanyResearchEndpoint:
    @pytest.mark.asyncio
    async def test_get_research_returns_404_when_not_run(
        self,
        user_factory,
        as_user,
    ) -> None:
        """GET /companies/{id}/research returns 404 before research is run."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.get(f"/companies/{company_id}/research")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_research_returns_404_for_other_users_company(
        self,
        user_factory,
        as_user,
    ) -> None:
        """GET /companies/{id}/research returns 404 for cross-tenant access."""
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        async with await as_user(attacker) as authed:
            resp = await authed.get(f"/companies/{company_id}/research")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST research endpoint (trigger)
# ---------------------------------------------------------------------------


class TestTriggerCompanyResearchEndpoint:
    @pytest.mark.asyncio
    async def test_trigger_returns_200_with_research(
        self,
        user_factory,
        as_user,
    ) -> None:
        """POST /companies/{id}/research returns 200 with research record."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(return_value=MOCK_CLAUDE_RESPONSE),
            ),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 200
        body = resp.json()
        assert body["overall_sentiment"] == "positive"
        assert body["company_id"] == company_id
        assert isinstance(body["sources"], list)
        assert len(body["sources"]) == len(MOCK_TAVILY_RESULTS)

    @pytest.mark.asyncio
    async def test_trigger_returns_404_for_unknown_company(
        self,
        user_factory,
        as_user,
    ) -> None:
        """POST /companies/{id}/research returns 404 when company doesn't exist."""
        user = await user_factory()
        fake_id = str(uuid.uuid4())

        async with await as_user(user) as authed:
            resp = await authed.post(f"/companies/{fake_id}/research")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_trigger_unauthenticated_returns_401(
        self,
        user_factory,
        as_user,
        client: AsyncClient,
    ) -> None:
        """POST /companies/{id}/research requires auth."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        resp = await client.post(f"/companies/{company_id}/research")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_trigger_returns_504_on_tavily_timeout(
        self,
        user_factory,
        as_user,
    ) -> None:
        """A Tavily ReadTimeout (httpx.RequestError, not HTTPStatusError)
        must surface as 504 with a typed detail — NOT a bare 500."""
        import httpx

        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        with patch(
            "app.services.company.company_research_service.search_company",
            new=AsyncMock(side_effect=httpx.ReadTimeout("read timeout")),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 504
        assert "ReadTimeout" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_trigger_returns_500_with_type_on_unexpected_error(
        self,
        user_factory,
        as_user,
    ) -> None:
        """Unexpected exceptions (DB IntegrityError, KeyError, etc.)
        surface 500 WITH the exception type+message — not a bare
        'Internal Server Error' that gives the operator no signal."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        with patch(
            "app.services.company.company_research_service.search_company",
            new=AsyncMock(side_effect=KeyError("results")),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post(f"/companies/{company_id}/research")

        assert resp.status_code == 500
        assert "KeyError" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_returns_500_with_type_on_unexpected_error(
        self,
        user_factory,
        as_user,
    ) -> None:
        """The GET research endpoint had no exception coverage — same
        bare-500 problem the POST endpoint had. Verify the new fallback
        surfaces the exception type."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        with patch(
            "app.services.company.company_research_service.get_research",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            async with await as_user(user) as authed:
                resp = await authed.get(f"/companies/{company_id}/research")

        assert resp.status_code == 500
        assert "RuntimeError" in resp.json()["detail"]
        assert "boom" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Source de-duplication on rerun
# ---------------------------------------------------------------------------


class TestResearchSourceDedup:
    """The upsert path was APPENDING sources on rerun without deleting
    the old ones. Verify the fix: rerunning research replaces sources
    rather than accumulating."""

    @pytest.mark.asyncio
    async def test_rerun_replaces_sources_instead_of_appending(
        self,
        user_factory,
        as_user,
        db: AsyncSession,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_company_payload())
            assert create.status_code == 201
            company_id_str = create.json()["id"]
            company_id = uuid.UUID(company_id_str)

        from app.services.company import company_research_service

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(return_value=MOCK_CLAUDE_RESPONSE),
            ),
        ):
            r1 = await company_research_service.run_research(
                db, company_id=company_id, user_id=uuid.UUID(user["id"])
            )

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=MOCK_TAVILY_RESULTS),
            ),
            patch(
                "app.services.company.company_research_service.claude_service.call_claude",
                new=AsyncMock(return_value=MOCK_CLAUDE_RESPONSE),
            ),
        ):
            r2 = await company_research_service.run_research(
                db, company_id=company_id, user_id=uuid.UUID(user["id"])
            )

        assert r1.id == r2.id
        sources = await company_research_repository.list_sources_for_research(
            db, r2.id, uuid.UUID(user["id"])
        )
        assert len(sources) == len(MOCK_TAVILY_RESULTS), (
            f"Expected {len(MOCK_TAVILY_RESULTS)} sources after rerun, got "
            f"{len(sources)} — sources are accumulating instead of being "
            "replaced on upsert."
        )
