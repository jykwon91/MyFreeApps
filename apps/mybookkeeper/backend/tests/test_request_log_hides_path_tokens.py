"""The request log line names the route template, so an invite token in the path is never logged."""
import logging
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

_TOKEN = "s3cret-invite-token-0123456789"


def test_invite_token_is_not_in_the_request_log(caplog: pytest.LogCaptureFixture) -> None:
    with (
        patch(
            "app.api.organizations.organization_service.get_invite_info",
            AsyncMock(side_effect=LookupError("Invite not found")),
        ),
        caplog.at_level(logging.INFO, logger="platform_shared.core.request_audit_middleware"),
    ):
        response = TestClient(app).get(f"/organizations/invites/{_TOKEN}/info")

    assert response.status_code == 404
    assert _TOKEN not in caplog.text
    assert "GET /organizations/invites/{token}/info 404" in caplog.text
