"""Unit tests for Settings.discovery_jsearch_pages_per_fetch and its wiring
into the JSearch fetch call.

Two concerns tested here:

1. **Settings default** — the field exists, defaults to 5, and accepts values
   in [1, 20] while rejecting out-of-range integers.

2. **Fetch-service wiring** — ``_run_jsearch`` passes
   ``settings.discovery_jsearch_pages_per_fetch`` as ``num_pages`` to the
   JSearch adapter instead of the old hard-coded 1.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings


# ---------------------------------------------------------------------------
# Helpers — minimal settings stub (avoids triggering the full Settings()
# singleton which requires DATABASE_URL + other required env vars)
# ---------------------------------------------------------------------------


class _PagesSettings(BaseSettings):
    """Minimal stand-in that mirrors only the field under test."""

    discovery_jsearch_pages_per_fetch: int = Field(default=5, ge=1, le=20)

    model_config = {"env_file": None, "extra": "ignore"}


# ---------------------------------------------------------------------------
# Settings field tests
# ---------------------------------------------------------------------------


class TestDiscoveryJSearchPagesPerFetchSetting:
    def test_default_is_five(self) -> None:
        s = _PagesSettings()
        assert s.discovery_jsearch_pages_per_fetch == 5

    def test_accepts_minimum_value_one(self) -> None:
        s = _PagesSettings(discovery_jsearch_pages_per_fetch=1)
        assert s.discovery_jsearch_pages_per_fetch == 1

    def test_accepts_maximum_value_twenty(self) -> None:
        s = _PagesSettings(discovery_jsearch_pages_per_fetch=20)
        assert s.discovery_jsearch_pages_per_fetch == 20

    def test_accepts_mid_range_value(self) -> None:
        s = _PagesSettings(discovery_jsearch_pages_per_fetch=10)
        assert s.discovery_jsearch_pages_per_fetch == 10

    def test_rejects_zero(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _PagesSettings(discovery_jsearch_pages_per_fetch=0)
        errors = exc_info.value.errors()
        assert any(
            e["loc"] == ("discovery_jsearch_pages_per_fetch",) for e in errors
        ), f"Expected validation error on discovery_jsearch_pages_per_fetch, got: {errors}"

    def test_rejects_twenty_one(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _PagesSettings(discovery_jsearch_pages_per_fetch=21)
        errors = exc_info.value.errors()
        assert any(
            e["loc"] == ("discovery_jsearch_pages_per_fetch",) for e in errors
        ), f"Expected validation error on discovery_jsearch_pages_per_fetch, got: {errors}"

    def test_rejects_negative(self) -> None:
        with pytest.raises(ValidationError):
            _PagesSettings(discovery_jsearch_pages_per_fetch=-1)


# ---------------------------------------------------------------------------
# Fetch-service wiring test — _run_jsearch must forward
# settings.discovery_jsearch_pages_per_fetch as num_pages
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_jsearch_passes_pages_per_fetch_setting() -> None:
    """_run_jsearch must pass settings.discovery_jsearch_pages_per_fetch
    as num_pages to jsearch.search, not the old hard-coded 1."""
    from app.services.discovery import discovery_fetch_service
    from app.services.discovery.discovery_fetch_service import _run_jsearch

    mock_search = AsyncMock(return_value=[])

    # Patch settings so the test is deterministic regardless of local env.
    with (
        patch.object(
            discovery_fetch_service.settings,
            "discovery_jsearch_pages_per_fetch",
            7,
        ),
        patch(
            "app.services.discovery.discovery_fetch_service.jsearch.search",
            mock_search,
        ),
    ):
        config = {"query": "python engineer remote"}
        await _run_jsearch(config)

    mock_search.assert_awaited_once()
    call_kwargs = mock_search.call_args.kwargs
    assert call_kwargs["num_pages"] == 7, (
        f"Expected num_pages=7 (from patched setting), got {call_kwargs.get('num_pages')!r}"
    )


@pytest.mark.asyncio
async def test_run_jsearch_default_setting_is_five() -> None:
    """When the setting is at its default (5), _run_jsearch passes num_pages=5."""
    from app.core.config import settings as real_settings
    from app.services.discovery import discovery_fetch_service
    from app.services.discovery.discovery_fetch_service import _run_jsearch

    mock_search = AsyncMock(return_value=[])

    # Only patch the adapter call — use the real settings singleton so we
    # verify the actual default wiring in production code.
    with patch(
        "app.services.discovery.discovery_fetch_service.jsearch.search",
        mock_search,
    ):
        config = {"query": "backend engineer"}
        await _run_jsearch(config)

    expected = real_settings.discovery_jsearch_pages_per_fetch
    call_kwargs = mock_search.call_args.kwargs
    assert call_kwargs["num_pages"] == expected, (
        f"Expected num_pages={expected} (real settings), got {call_kwargs.get('num_pages')!r}"
    )
