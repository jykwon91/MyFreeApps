"""The shared request middleware sets the audit user and logs one safe line per request."""
import logging

import jwt
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from platform_shared.core.audit import current_user_id
from platform_shared.core.request_audit_middleware import RequestAuditMiddleware
from platform_shared.core.request_log_constants import ACCESS_TOKEN_AUDIENCE

_SECRET = "test-secret-key-that-is-long-enough-32"
_LOGGER = "platform_shared.core.request_audit_middleware"


def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/shares/{token}")
    async def share(token: str) -> dict[str, str | None]:
        return {"user": current_user_id.get(), "t": token[:1]}

    @app.get("/down/{token}")
    async def down(token: str) -> JSONResponse:
        return JSONResponse({"t": token[:1]}, status_code=503)

    app.add_middleware(RequestAuditMiddleware, secret_key=_SECRET)
    return app


def _bearer(sub: str, secret: str = _SECRET) -> dict[str, str]:
    token = jwt.encode({"sub": sub, "aud": ACCESS_TOKEN_AUDIENCE}, secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def test_a_valid_token_sets_the_audit_user_and_is_logged_by_id(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger=_LOGGER):
        response = TestClient(_app()).get("/shares/s3cret-share", headers=_bearer("user-123"))
    assert response.json()["user"] == "user-123"
    assert "GET /shares/{token} 200" in caplog.text
    assert "user=user-123" in caplog.text
    assert "s3cret" not in caplog.text
    assert current_user_id.get() is None


@pytest.mark.parametrize("headers", [{}, _bearer("user-123", secret="another-secret-key-also-32-chars-x")])
def test_no_or_bad_token_is_anonymous(caplog: pytest.LogCaptureFixture, headers: dict[str, str]) -> None:
    with caplog.at_level(logging.INFO, logger=_LOGGER):
        response = TestClient(_app()).get("/shares/abc", headers=headers)
    assert response.json()["user"] is None
    assert "user=anonymous" in caplog.text


def test_a_request_without_a_valid_token_leaves_the_audit_user_as_it_was() -> None:
    outer = current_user_id.set("worker-7")
    try:
        response = TestClient(_app()).get("/shares/abc")
    finally:
        current_user_id.reset(outer)
    assert response.json()["user"] == "worker-7"


def test_a_5xx_logs_an_error_naming_the_template(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger=_LOGGER):
        response = TestClient(_app()).get("/down/s3cret")
    assert response.status_code == 503
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR and r.name == _LOGGER]
    assert errors == ["5xx on GET /down/{token}"]
