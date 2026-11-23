"""Server error replies send fixed copy, never the exception's own text.

Each failure here carries operator or tool text (an env var to set, pandoc's
stderr). The reply keeps its status and sends our copy; the text is logged.
"""
from __future__ import annotations

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.company_research_messages import TAVILY_NOT_CONFIGURED_DETAIL
from app.core.resume_export_messages import RESUME_EXPORT_FAILED_MESSAGE
from app.services.integrations.tavily_service import TavilyNotConfiguredError


@pytest.mark.asyncio
async def test_research_without_tavily_is_a_503_with_our_copy(
    user_factory, as_user, caplog: pytest.LogCaptureFixture,
) -> None:
    operator_text = "TAVILY_API_KEY is not configured. Set it in .env.docker"
    user = await user_factory()
    async with await as_user(user) as authed:
        create = await authed.post(
            "/companies",
            json={"name": "Acme", "primary_domain": "acme.example.com"},
        )
        company_id = create.json()["id"]

    with (
        patch(
            "app.services.company.company_research_service.search_company",
            new=AsyncMock(side_effect=TavilyNotConfiguredError(operator_text)),
        ),
        patch(
            "app.services.company.company_research_service.search_company_overview",
            new=AsyncMock(side_effect=TavilyNotConfiguredError(operator_text)),
        ),
        caplog.at_level(logging.ERROR, logger="app.api.companies"),
    ):
        async with await as_user(user) as authed:
            resp = await authed.post(f"/companies/{company_id}/research")

    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == TAVILY_NOT_CONFIGURED_DETAIL
    assert "TAVILY_API_KEY" not in resp.text
    assert any("TAVILY_API_KEY" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_export_converter_failure_is_a_502_with_our_copy(
    user_factory, as_user, caplog: pytest.LogCaptureFixture,
) -> None:
    tool_text = "pandoc DOCX conversion failed: /tmp/pandoc-123/input.md: permission denied"
    user = await user_factory()

    with (
        patch(
            "app.api.resume_refinement.session_service.get_session_state",
            new=AsyncMock(return_value=SimpleNamespace(current_draft="# Jane Doe\n\nEngineer")),
        ),
        patch(
            "app.api.resume_refinement.export_resume",
            new=AsyncMock(side_effect=RuntimeError(tool_text)),
        ),
        caplog.at_level(logging.ERROR, logger="app.api.resume_refinement"),
    ):
        async with await as_user(user) as authed:
            resp = await authed.get(
                f"/resume-refinement/sessions/{uuid.uuid4()}/export",
                params={"format": "docx"},
            )

    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == RESUME_EXPORT_FAILED_MESSAGE
    assert "pandoc" not in resp.text
    assert any(r.exc_info and tool_text in str(r.exc_info[1]) for r in caplog.records)
