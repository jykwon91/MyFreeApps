"""The request log names the route template, so a token in the path is never logged."""
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.testclient import TestClient

from platform_shared.core.request_log_constants import UNMATCHED_REQUEST_PATH
from platform_shared.core.request_log_path import request_log_path


def _app(logged: list[str]) -> FastAPI:
    app = FastAPI()
    router = APIRouter(prefix="/organizations")

    @router.get("/invites/{token}/info")
    async def info(token: str) -> dict[str, str]:
        return {"ok": token[:1]}

    app.include_router(router)

    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        logged.append(request_log_path(request))
        return response

    return app


def test_a_matched_route_logs_its_template() -> None:
    logged: list[str] = []
    TestClient(_app(logged)).get("/organizations/invites/s3cret-invite-token/info")
    assert logged == ["/organizations/invites/{token}/info"]


def test_an_unmatched_path_logs_a_placeholder() -> None:
    logged: list[str] = []
    TestClient(_app(logged)).get("/nowhere/s3cret-token")
    assert logged == [UNMATCHED_REQUEST_PATH]


def test_the_trailing_slash_redirect_logs_a_placeholder() -> None:
    logged: list[str] = []
    response = TestClient(_app(logged)).get(
        "/organizations/invites/s3cret-invite-token/info/", follow_redirects=False,
    )
    assert response.status_code == 307
    assert logged == [UNMATCHED_REQUEST_PATH]
    assert not any("s3cret" in line for line in logged)
