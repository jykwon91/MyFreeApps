"""Route-level contract for /savings.

Services are mocked (behaviour is in ``test_savings_research_service``).
Pinned: every route is scoped to the caller's workspace and person;
"Research now" answers 202 and queues the run in the background; research
off and a run already going are 409, the daily limit is 429 with
Retry-After; an unknown idea is 404 and an unknown status 422.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError
from app.schemas.savings.savings_idea_response import SavingsIdeaResponse
from app.schemas.savings.savings_overview_response import SavingsOverviewResponse
from app.services.savings.manual_run_limit_error import ManualRunLimitError
from app.services.savings.research_disabled_error import ResearchDisabledError
from app.services.savings.savings_idea_not_found_error import SavingsIdeaNotFoundError

_OVERVIEW = "app.api.savings.savings_overview_service"
_RESEARCH = "app.api.savings.savings_research_service"
_CTX = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
_EMPTY = SavingsOverviewResponse(
    research_enabled=False, total_savings_low_cents=0, total_savings_high_cents=0, last_researched_at=None,
    next_research_due_at=None, run_in_progress=False, latest_run=None, manual_runs_left=3, manual_run_limit=3,
    next_manual_run_at=None, ideas=[],
)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    for dependency in (current_org_member, require_write_access, reject_demo_org_write):
        app.dependency_overrides[dependency] = lambda: _CTX
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _scoped(mock: AsyncMock) -> None:
    assert mock.await_args.kwargs["organization_id"] == _CTX.organization_id
    assert mock.await_args.kwargs["user_id"] == _CTX.user_id


def test_the_overview_is_the_callers(client: TestClient) -> None:
    service = AsyncMock(return_value=_EMPTY)
    with patch(f"{_OVERVIEW}.get_overview", service):
        res = client.get("/savings")
    assert res.status_code == 200
    assert res.json()["manual_run_limit"] == 3
    _scoped(service)


def test_turning_research_on_returns_the_overview_and_starts_the_first_run(client: TestClient) -> None:
    setter = AsyncMock()
    run_id = uuid.uuid4()
    first = AsyncMock(return_value=run_id)
    execute = AsyncMock()
    with (
        patch(f"{_OVERVIEW}.set_research_enabled", setter),
        patch(f"{_OVERVIEW}.get_overview", AsyncMock(return_value=_EMPTY)),
        patch(f"{_RESEARCH}.start_first_run", first),
        patch(f"{_RESEARCH}.execute_run", execute),
    ):
        res = client.put("/savings/settings", json={"enabled": True})
    assert res.status_code == 200
    assert setter.await_args.kwargs["enabled"] is True
    _scoped(setter)
    _scoped(first)
    assert execute.await_args.args == (run_id,)


def test_turning_research_off_starts_nothing(client: TestClient) -> None:
    execute = AsyncMock()
    with (
        patch(f"{_OVERVIEW}.set_research_enabled", AsyncMock()),
        patch(f"{_OVERVIEW}.get_overview", AsyncMock(return_value=_EMPTY)),
        patch(f"{_RESEARCH}.start_first_run", AsyncMock(return_value=None)),
        patch(f"{_RESEARCH}.execute_run", execute),
    ):
        res = client.put("/savings/settings", json={"enabled": False})
    assert res.status_code == 200
    execute.assert_not_awaited()


def test_research_now_queues_the_run_in_the_background(client: TestClient) -> None:
    run_id = uuid.uuid4()
    start = AsyncMock(return_value=run_id)
    execute = AsyncMock()
    with patch(f"{_RESEARCH}.start_manual_run", start), patch(f"{_RESEARCH}.execute_run", execute):
        res = client.post("/savings/research")
    assert res.status_code == 202
    assert res.json() == {"run_id": str(run_id)}
    _scoped(start)
    execute.assert_awaited_once()
    assert execute.await_args.args == (run_id,)
    _scoped(execute)


@pytest.mark.parametrize("error", [ResearchDisabledError(), RunAlreadyRunningError()])
def test_research_now_is_409_when_off_or_already_running(client: TestClient, error: Exception) -> None:
    execute = AsyncMock()
    with patch(f"{_RESEARCH}.start_manual_run", AsyncMock(side_effect=error)), patch(f"{_RESEARCH}.execute_run", execute):
        res = client.post("/savings/research")
    assert res.status_code == 409
    execute.assert_not_awaited()


def test_the_daily_limit_is_429_with_retry_after(client: TestClient) -> None:
    later = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=2)
    with patch(f"{_RESEARCH}.start_manual_run", AsyncMock(side_effect=ManualRunLimitError(later))):
        res = client.post("/savings/research")
    assert res.status_code == 429
    assert 7000 < int(res.headers["retry-after"]) <= 7200
    assert "research runs" in res.json()["detail"]


def test_marking_an_idea(client: TestClient) -> None:
    idea_id = uuid.uuid4()
    body = SavingsIdeaResponse(
        id=idea_id, category="subscription", title="Cancel Hulu", savings_low_cents=1, savings_high_cents=2,
        effort="low", why_it_fits="x", steps=[], source_urls=[], card_details=None, expires_on=None,
        status="dismissed", last_confirmed_at=_dt.datetime.now(_dt.timezone.utc),
    )
    service = AsyncMock(return_value=body)
    with patch(f"{_OVERVIEW}.set_idea_status", service):
        res = client.patch(f"/savings/ideas/{idea_id}", json={"status": "dismissed"})
    assert res.status_code == 200
    assert service.await_args.kwargs["idea_id"] == idea_id
    _scoped(service)


def test_an_unknown_idea_is_404_and_an_unknown_status_422(client: TestClient) -> None:
    with patch(f"{_OVERVIEW}.set_idea_status", AsyncMock(side_effect=SavingsIdeaNotFoundError())):
        missing = client.patch(f"/savings/ideas/{uuid.uuid4()}", json={"status": "done"})
    bad = client.patch(f"/savings/ideas/{uuid.uuid4()}", json={"status": "archived"})
    assert missing.status_code == 404
    assert bad.status_code == 422


def test_the_routes_need_a_signed_in_member() -> None:
    app.dependency_overrides.clear()
    assert TestClient(app).get("/savings").status_code == 401
