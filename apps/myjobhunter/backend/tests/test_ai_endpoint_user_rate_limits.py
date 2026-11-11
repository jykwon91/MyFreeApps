"""Per-user rate limits on every authenticated endpoint that spends money.

Paid endpoints (Claude, Tavily, JSearch) must be limited per ``user.id``:
keyed on IP, every user behind one carrier NAT shares a single budget.

For each endpoint this proves:

1. Two users on the same IP do not share a limit.
2. A user who spends their budget gets 429.
3. The 429 happens BEFORE any paid work (the paid call is not awaited).
4. The limiter runs after auth (an anonymous request is 401 and spends nothing).
5. Routes that share a limiter really share it (alternating routes hit 429).
6. The hourly cap fires even when the short window has room.

Each module-level limiter is swapped for a small one with monkeypatch, so the
tests do not depend on the production budgets.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from types import ModuleType
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.api import applications, companies, discover, resume_refinement, resumes
from app.core.rate_limit import RateLimiter
from app.services.application.jd_parsing_service import JdParseError
from app.services.discovery.discovery_fetch_service import DiscoverySourceNotFoundError
from app.services.extraction.jd_url_extractor import JDFetchError
from app.services.jobs.resume_validator import ResumeRejected
from app.services.resume_refinement.errors import SessionNotFound, SourceJobNotFound

_BUDGET = 2
_ROOMY = 1000  # a window that cannot fire during a test
_SESSION_ID = uuid.uuid4()
_SESSION_PATH = f"/resume-refinement/sessions/{_SESSION_ID}"


@dataclass(frozen=True)
class Endpoint:
    """One rate-limited endpoint and the paid call that must not run on a 429."""

    id: str
    limiter_module: ModuleType
    limiter_attr: str
    path: str
    paid_call: str
    paid_error: Exception
    json: dict[str, Any] | None = None
    files: bool = False
    hourly_attr: str | None = None


def _turn(name: str, route: str, body: dict[str, Any] | None) -> Endpoint:
    return Endpoint(
        id=f"refinement-{name}",
        limiter_module=resume_refinement,
        limiter_attr="_TURN_LIMITER_PER_5_MIN",
        hourly_attr="_TURN_LIMITER_PER_HOUR",
        path=f"{_SESSION_PATH}/{route}",
        paid_call=f"app.services.resume_refinement.session_service.{name}",
        paid_error=SessionNotFound(),
        json=body,
    )


ENDPOINTS: list[Endpoint] = [
    Endpoint(
        id="parse-jd",
        limiter_module=applications,
        limiter_attr="_JD_PARSE_LIMITER",
        path="/applications/parse-jd",
        paid_call="app.api.applications.parse_jd",
        paid_error=JdParseError("boom"),
        json={"jd_text": "Senior engineer. " * 10},
    ),
    Endpoint(
        id="extract-from-url",
        limiter_module=applications,
        limiter_attr="_JD_URL_EXTRACT_LIMITER",
        path="/applications/extract-from-url",
        paid_call="app.api.applications.extract_from_url",
        paid_error=JDFetchError("boom"),
        json={"url": "https://boards.example.com/jobs/1"},
    ),
    Endpoint(
        id="discover-refresh",
        limiter_module=discover,
        limiter_attr="_REFRESH_LIMITER",
        path=f"/discover/sources/{uuid.uuid4()}/refresh",
        paid_call="app.services.discovery.discovery_fetch_service.fetch_source",
        paid_error=DiscoverySourceNotFoundError(),
    ),
    Endpoint(
        id="company-research",
        limiter_module=companies,
        limiter_attr="_RESEARCH_LIMITER_PER_5_MIN",
        hourly_attr="_RESEARCH_LIMITER_PER_HOUR",
        path=f"/companies/{uuid.uuid4()}/research",
        paid_call="app.services.company.company_research_service.run_research",
        paid_error=ValueError("boom"),
    ),
    Endpoint(
        id="resume-upload",
        limiter_module=resumes,
        limiter_attr="_UPLOAD_LIMITER",
        path="/resumes",
        paid_call="app.api.resumes.create_upload",
        paid_error=ResumeRejected("exceeds the size limit"),
        files=True,
    ),
    Endpoint(
        id="refinement-start",
        limiter_module=resume_refinement,
        limiter_attr="_PREPARE_LIMITER",
        path="/resume-refinement/sessions",
        paid_call="app.services.resume_refinement.session_service.start_session",
        paid_error=SourceJobNotFound("missing"),
        json={"source_resume_job_id": str(uuid.uuid4())},
    ),
    Endpoint(
        id="refinement-retry-preparation",
        limiter_module=resume_refinement,
        limiter_attr="_PREPARE_LIMITER",
        path=f"{_SESSION_PATH}/retry-preparation",
        paid_call="app.services.resume_refinement.session_service.retry_preparation",
        paid_error=SessionNotFound(),
    ),
    _turn("accept_pending", "accept", None),
    _turn("accept_flagged", "accept-flagged", None),
    _turn("accept_custom", "custom", {"user_text": "my own wording"}),
    _turn("request_alternative", "alternative", {}),
    _turn("skip_target", "skip", None),
    _turn("navigate", "navigate", {"direction": "next"}),
    _turn(
        "create_target_from_line",
        "target-from-line",
        {"current_text": "Built things", "section": "Experience"},
    ),
]

_ENDPOINT_PARAMS = [pytest.param(e, id=e.id) for e in ENDPOINTS]

# Pydantic validation and multipart parsing must succeed for the request to
# reach the handler; the upload's body content is irrelevant (create_upload is
# mocked) but the part must exist.
_UPLOAD_FILES = {"file": ("resume.pdf", b"%PDF-1.4 stub", "application/pdf")}


UserFactory = Callable[[], Awaitable[dict[str, Any]]]
AsUser = Callable[[dict[str, Any]], Awaitable[AsyncClient]]


@pytest.fixture(autouse=True)
def _small_budgets(monkeypatch: pytest.MonkeyPatch) -> None:
    """Swap every limiter under test for a fresh, tiny one.

    The hourly caps start roomy so the short window is what fires; the
    hourly-cap test tightens them itself.
    """
    for endpoint in ENDPOINTS:
        monkeypatch.setattr(
            endpoint.limiter_module,
            endpoint.limiter_attr,
            RateLimiter(max_attempts=_BUDGET, window_seconds=300),
        )
        if endpoint.hourly_attr:
            monkeypatch.setattr(
                endpoint.limiter_module,
                endpoint.hourly_attr,
                RateLimiter(max_attempts=_ROOMY, window_seconds=3600),
            )


@contextmanager
def _paid_call_mocked(endpoint: Endpoint) -> Iterator[AsyncMock]:
    mock = AsyncMock(side_effect=endpoint.paid_error)
    with patch(endpoint.paid_call, new=mock):
        yield mock


async def _post(client: AsyncClient, endpoint: Endpoint) -> int:
    if endpoint.files:
        resp = await client.post(endpoint.path, files=_UPLOAD_FILES)
    else:
        resp = await client.post(endpoint.path, json=endpoint.json)
    return resp.status_code


@pytest.mark.parametrize("endpoint", _ENDPOINT_PARAMS)
async def test_user_over_budget_gets_429_and_no_paid_call(
    endpoint: Endpoint, user_factory: UserFactory, as_user: AsUser,
) -> None:
    user = await user_factory()
    with _paid_call_mocked(endpoint) as paid:
        async with await as_user(user) as authed:
            for _ in range(_BUDGET):
                assert await _post(authed, endpoint) != 429
            assert paid.await_count == _BUDGET

            assert await _post(authed, endpoint) == 429
            assert paid.await_count == _BUDGET, "paid call ran on a 429"


@pytest.mark.parametrize("endpoint", _ENDPOINT_PARAMS)
async def test_two_users_on_one_ip_do_not_share_budget(
    endpoint: Endpoint, user_factory: UserFactory, as_user: AsUser,
) -> None:
    first = await user_factory()
    second = await user_factory()
    with _paid_call_mocked(endpoint) as paid:
        async with await as_user(first) as first_client:
            for _ in range(_BUDGET):
                await _post(first_client, endpoint)
            assert await _post(first_client, endpoint) == 429

        # Same ASGI transport, so the same client IP as the first user.
        async with await as_user(second) as second_client:
            assert await _post(second_client, endpoint) != 429
        assert paid.await_count == _BUDGET + 1


@pytest.mark.parametrize("endpoint", _ENDPOINT_PARAMS)
async def test_anonymous_request_is_401_and_spends_nothing(
    endpoint: Endpoint, client: AsyncClient,
) -> None:
    with _paid_call_mocked(endpoint) as paid:
        for _ in range(_BUDGET + 1):
            assert await _post(client, endpoint) == 401
        assert paid.await_count == 0


@pytest.mark.parametrize(
    "endpoint",
    [pytest.param(e, id=e.id) for e in ENDPOINTS if e.hourly_attr],
)
async def test_hourly_cap_fires_when_short_window_has_room(
    endpoint: Endpoint,
    user_factory: UserFactory,
    as_user: AsUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert endpoint.hourly_attr is not None
    monkeypatch.setattr(
        endpoint.limiter_module,
        endpoint.limiter_attr,
        RateLimiter(max_attempts=_ROOMY, window_seconds=300),
    )
    monkeypatch.setattr(
        endpoint.limiter_module,
        endpoint.hourly_attr,
        RateLimiter(max_attempts=_BUDGET, window_seconds=3600),
    )
    user = await user_factory()
    with _paid_call_mocked(endpoint) as paid:
        async with await as_user(user) as authed:
            for _ in range(_BUDGET):
                assert await _post(authed, endpoint) != 429
            assert await _post(authed, endpoint) == 429
            assert paid.await_count == _BUDGET


async def _alternate_until_429(
    endpoints: list[Endpoint], user_factory: UserFactory, as_user: AsUser,
) -> list[int]:
    """Call the endpoints in turn as one user; return the status codes seen."""
    user = await user_factory()
    statuses: list[int] = []
    with ExitStack() as stack:
        for endpoint in endpoints:
            stack.enter_context(
                patch(endpoint.paid_call, new=AsyncMock(side_effect=endpoint.paid_error)),
            )
        async with await as_user(user) as authed:
            for call in range(_BUDGET + 1):
                statuses.append(await _post(authed, endpoints[call % len(endpoints)]))
    return statuses


async def test_start_and_retry_preparation_share_one_limiter(
    user_factory: UserFactory, as_user: AsUser,
) -> None:
    pair = [e for e in ENDPOINTS if e.id in ("refinement-start", "refinement-retry-preparation")]
    assert len(pair) == 2
    statuses = await _alternate_until_429(pair, user_factory, as_user)
    assert statuses[-1] == 429
    assert 429 not in statuses[:-1]


async def test_all_turn_routes_share_one_limiter(
    user_factory: UserFactory, as_user: AsUser,
) -> None:
    turn_routes = [e for e in ENDPOINTS if e.id.startswith("refinement-") and e.hourly_attr]
    assert len(turn_routes) == 7
    statuses = await _alternate_until_429(turn_routes, user_factory, as_user)
    assert statuses[-1] == 429
    assert 429 not in statuses[:-1]
