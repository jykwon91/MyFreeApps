"""Tests for the Tavily service — fail-loud + dev stub behavior.

These tests do NOT make real network calls. They patch settings and
httpx.AsyncClient to exercise the two key behaviors:

1. Fail-loud: TavilyNotConfiguredError raised when key is empty and not dev.
2. Dev stub: warning-logged stub response returned when key is empty + dev mode.
3. Happy path: results parsed correctly from a mocked Tavily response.
"""
from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.integrations.tavily_service import (
    TavilyNotConfiguredError,
    search_company,
)


# ---------------------------------------------------------------------------
# Fail-loud: key missing + NOT in dev
# ---------------------------------------------------------------------------


class TestTavilyFailLoud:
    @pytest.mark.asyncio
    async def test_raises_when_key_empty_and_not_dev(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """search_company raises TavilyNotConfiguredError when key is absent."""
        monkeypatch.delenv("MYJOBHUNTER_ENV", raising=False)
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "")

        with pytest.raises(TavilyNotConfiguredError):
            await search_company("Acme Corp")

    @pytest.mark.asyncio
    async def test_raises_when_env_is_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Explicitly production-flagged env still raises."""
        monkeypatch.setenv("MYJOBHUNTER_ENV", "production")
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "")

        with pytest.raises(TavilyNotConfiguredError):
            await search_company("Acme Corp")


# ---------------------------------------------------------------------------
# Dev stub mode
# ---------------------------------------------------------------------------


class TestTavilyDevStub:
    @pytest.mark.asyncio
    async def test_returns_stub_when_key_empty_and_dev(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Returns stub results (no network call) when in dev mode."""
        monkeypatch.setenv("MYJOBHUNTER_ENV", "development")
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "")

        results = await search_company("TestCorp")

        assert isinstance(results, list)
        assert len(results) >= 1
        assert all("url" in r for r in results)
        assert all("source_type" in r for r in results)

    @pytest.mark.asyncio
    async def test_stub_source_types_are_valid(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Stub results use valid source_type values."""
        valid_types = {"glassdoor", "teamblind", "reddit", "levels", "payscale", "news", "official", "other"}
        monkeypatch.setenv("MYJOBHUNTER_ENV", "development")
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "")

        results = await search_company("AnyCompany")

        for r in results:
            assert r["source_type"] in valid_types, f"Invalid source_type: {r['source_type']}"


# ---------------------------------------------------------------------------
# Happy path with mocked HTTP
# ---------------------------------------------------------------------------


class TestTavilyHappyPath:
    @pytest.mark.asyncio
    async def test_parses_results_correctly(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Results are parsed from the Tavily API response shape."""
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "test-key-abc")
        monkeypatch.delenv("MYJOBHUNTER_ENV", raising=False)

        fake_response_data = {
            "results": [
                {
                    "url": "https://glassdoor.com/reviews/acme",
                    "title": "Acme Corp Reviews",
                    "content": "Great work-life balance.",
                    "score": 0.9,
                },
                {
                    "url": "https://reddit.com/r/cscareerquestions/acme",
                    "title": "Acme discussion",
                    "content": "Solid compensation.",
                    "score": 0.75,
                },
            ]
        }

        mock_response = MagicMock()
        mock_response.json.return_value = fake_response_data
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.integrations.tavily_service.httpx.AsyncClient", return_value=mock_client):
            results = await search_company("Acme Corp", domain="acme.com")

        assert len(results) == 2
        assert results[0]["url"] == "https://glassdoor.com/reviews/acme"
        assert results[0]["source_type"] == "glassdoor"
        assert results[1]["source_type"] == "reddit"

    @pytest.mark.asyncio
    async def test_skips_results_without_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Results missing a URL are filtered out."""
        from app.core.config import settings
        monkeypatch.setattr(settings, "tavily_api_key", "test-key-abc")
        monkeypatch.delenv("MYJOBHUNTER_ENV", raising=False)

        fake_response_data = {
            "results": [
                {"url": "https://glassdoor.com/reviews/acme", "title": "Valid", "content": "x", "score": 0.8},
                {"url": "", "title": "No URL", "content": "y", "score": 0.5},
                {"title": "Also no URL", "content": "z", "score": 0.3},
            ]
        }

        mock_response = MagicMock()
        mock_response.json.return_value = fake_response_data
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.integrations.tavily_service.httpx.AsyncClient", return_value=mock_client):
            results = await search_company("Acme Corp")

        assert len(results) == 1
        assert results[0]["url"] == "https://glassdoor.com/reviews/acme"
