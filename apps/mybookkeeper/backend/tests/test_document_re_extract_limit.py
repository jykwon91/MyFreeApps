"""POST /documents/{id}/re-extract is a paid model request the upload cap never sees."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.rate_limit import document_re_extract_limiter
from app.main import app
from app.models.organization.organization_member import OrgRole

_SERVICE = "app.api.documents.document_service.re_extract_document"


def _post(user_id: uuid.UUID) -> int:
    app.dependency_overrides[current_org_member] = lambda: RequestContext(
        organization_id=uuid.uuid4(), user_id=user_id, org_role=OrgRole.OWNER,
    )
    try:
        return TestClient(app).post(f"/documents/{uuid.uuid4()}/re-extract").status_code
    finally:
        app.dependency_overrides.clear()


def test_over_the_limit_returns_429_before_the_document_is_reset() -> None:
    with patch.object(
        document_re_extract_limiter, "check", side_effect=HTTPException(429, "slow down"),
    ), patch(_SERVICE, new_callable=AsyncMock) as mock_re_extract:
        assert _post(uuid.uuid4()) == 429
    mock_re_extract.assert_not_called()


def test_limit_is_keyed_per_user() -> None:
    user_id = uuid.uuid4()
    with patch.object(document_re_extract_limiter, "check") as mock_check, patch(
        _SERVICE, new_callable=AsyncMock, return_value=True,
    ):
        assert _post(user_id) == 202
    assert str(user_id) in mock_check.call_args.args[0]
