"""Input cap and per-user rate limit on POST /jobs/analyze."""
from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.api import job_analysis as job_analysis_api
from app.core.job_description_limits import JD_TEXT_MAX_LEN
from app.core.rate_limit import RateLimiter

_CALL_CLAUDE = "app.services.job_analysis.job_analysis_service.claude_service.call_claude_with_meta"
_BUDGET = 2

_ENVELOPE: dict[str, Any] = {
    "extracted": {"title": "Engineer", "company": "Acme"},
    "verdict": "worth_considering",
    "verdict_summary": "Fine.",
    "dimensions": [
        {"key": key, "status": "unclear", "rationale": "n/a"}
        for key in ("skill_match", "seniority", "salary", "location_remote", "work_auth")
    ],
    "red_flags": [],
    "green_flags": [],
}


def _claude_result() -> dict[str, Any]:
    return {
        "parsed": _ENVELOPE,
        "input_tokens": 1,
        "output_tokens": 1,
        "cost_usd": Decimal("0.001"),
    }


@pytest.fixture
def small_limiter(monkeypatch: pytest.MonkeyPatch) -> RateLimiter:
    limiter = RateLimiter(max_attempts=_BUDGET, window_seconds=300)
    monkeypatch.setattr(job_analysis_api, "_ANALYZE_LIMITER", limiter)
    return limiter


async def _post_text(client: AsyncClient, text: str, ip: str = "203.0.113.1") -> int:
    resp = await client.post(
        "/jobs/analyze",
        json={"jd_text": text},
        headers={"X-Forwarded-For": ip},
    )
    return resp.status_code


@pytest.mark.asyncio
async def test_over_long_jd_text_returns_422(
    client: AsyncClient, user_factory: Callable, as_user: Callable,
) -> None:
    authed = await as_user(await user_factory())
    with patch(_CALL_CLAUDE, new_callable=AsyncMock, return_value=_claude_result()) as claude:
        async with authed as ac:
            resp = await ac.post("/jobs/analyze", json={"jd_text": "x" * (JD_TEXT_MAX_LEN + 1)})

    assert resp.status_code == 422
    assert "at most" in resp.text
    claude.assert_not_called()


@pytest.mark.asyncio
async def test_jd_text_at_limit_passes_validation(
    client: AsyncClient, user_factory: Callable, as_user: Callable,
) -> None:
    authed = await as_user(await user_factory())
    with patch(_CALL_CLAUDE, new_callable=AsyncMock, return_value=_claude_result()):
        async with authed as ac:
            status = await _post_text(ac, "x" * JD_TEXT_MAX_LEN)

    assert status == 201


@pytest.mark.asyncio
async def test_two_users_on_one_ip_do_not_share_a_limit(
    client: AsyncClient, user_factory: Callable, as_user: Callable, small_limiter: RateLimiter,
) -> None:
    first = await as_user(await user_factory())
    second = await as_user(await user_factory())
    with patch(_CALL_CLAUDE, new_callable=AsyncMock, return_value=_claude_result()):
        async with first as ac1, second as ac2:
            first_statuses = [await _post_text(ac1, "Job one.") for _ in range(_BUDGET + 1)]
            second_status = await _post_text(ac2, "Job two.")

    assert first_statuses == [201] * _BUDGET + [429]
    assert second_status == 201


@pytest.mark.asyncio
async def test_one_user_on_two_ips_shares_a_limit(
    client: AsyncClient, user_factory: Callable, as_user: Callable, small_limiter: RateLimiter,
) -> None:
    authed = await as_user(await user_factory())
    with patch(_CALL_CLAUDE, new_callable=AsyncMock, return_value=_claude_result()):
        async with authed as ac:
            statuses = [
                await _post_text(ac, "Job.", ip=f"203.0.113.{n}") for n in range(1, _BUDGET + 2)
            ]

    assert statuses == [201] * _BUDGET + [429]
