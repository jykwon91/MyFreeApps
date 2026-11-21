"""What the tax advisor answers when its Claude call fails.

An SDK error leaves ``ask_tax_advisor`` as the shared ``ExtractionError``;
the generate route answers 502 with our own copy for its kind (never the
provider's text), with ``Retry-After`` only when the failure clears on its
own. 429 stays reserved for the daily advice limit, which the clients
show as "come back tomorrow".
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import anthropic
import httpx2
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from platform_shared.extraction import AnthropicFailureKind, ExtractionError

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org
from app.core.tax_advisor_failure_messages import (
    TAX_ADVISOR_BUSY_MESSAGE,
    TAX_ADVISOR_INPUT_REJECTED_MESSAGE,
    TAX_ADVISOR_RETRY_AFTER_SECONDS,
    TAX_ADVISOR_UNAVAILABLE_MESSAGE,
)
from app.main import app
from app.services.tax import tax_advisor_claude, tax_advisor_service

_PROVIDER_TEXT = "provider detail: org quota for claude-x exhausted"
_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str,
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_REQUEST)
    body = {"type": "error", "error": {"type": error_type, "message": _PROVIDER_TEXT}}
    return cls(_PROVIDER_TEXT, response=response, body=body)


class TestAskTaxAdvisorClassifies:
    @pytest.mark.parametrize(
        ("sdk_error", "kind"),
        [
            (_status_error(anthropic.InternalServerError, 529, "overloaded_error"), AnthropicFailureKind.UPSTREAM),
            (anthropic.APITimeoutError(request=_REQUEST), AnthropicFailureKind.UPSTREAM),
            (_status_error(anthropic.AuthenticationError, 401, "authentication_error"), AnthropicFailureKind.MISCONFIGURED),
            (_status_error(anthropic.BadRequestError, 400, "invalid_request_error"), AnthropicFailureKind.INPUT_REJECTED),
        ],
        ids=["overloaded", "timeout", "bad-key", "bad-request"],
    )
    @pytest.mark.asyncio
    async def test_sdk_error_leaves_as_classified_extraction_error(
        self, sdk_error: Exception, kind: AnthropicFailureKind,
    ) -> None:
        with patch.object(
            tax_advisor_claude, "_create_with_backoff", new=AsyncMock(side_effect=sdk_error),
        ):
            with pytest.raises(ExtractionError) as exc_info:
                await tax_advisor_claude.ask_tax_advisor(model="claude-x", tax_data_json="{}")
        assert exc_info.value.kind is kind


@pytest_asyncio.fixture()
async def client() -> AsyncIterator[AsyncClient]:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role="owner")
    app.dependency_overrides[current_active_user] = lambda: None
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[reject_demo_org] = lambda: ctx
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _failure(kind: AnthropicFailureKind | None) -> ExtractionError:
    return ExtractionError(_PROVIDER_TEXT, kind=kind, error_type="x", status=None)


class TestGenerateRouteAnswersOnKind:
    @pytest.mark.parametrize(
        ("kind", "detail", "retry_after"),
        [
            (AnthropicFailureKind.RATE_LIMITED, TAX_ADVISOR_BUSY_MESSAGE, True),
            (AnthropicFailureKind.UPSTREAM, TAX_ADVISOR_BUSY_MESSAGE, True),
            (AnthropicFailureKind.MISCONFIGURED, TAX_ADVISOR_UNAVAILABLE_MESSAGE, False),
            (AnthropicFailureKind.INPUT_REJECTED, TAX_ADVISOR_INPUT_REJECTED_MESSAGE, False),
            (None, TAX_ADVISOR_UNAVAILABLE_MESSAGE, False),
        ],
    )
    @pytest.mark.asyncio
    async def test_claude_failure_is_a_502_with_our_copy(
        self, client: AsyncClient, kind: AnthropicFailureKind | None, detail: str, retry_after: bool,
    ) -> None:
        with patch.object(
            tax_advisor_service, "generate_advice", new=AsyncMock(side_effect=_failure(kind)),
        ):
            resp = await client.post(f"/tax-returns/{uuid.uuid4()}/advisor/generate")

        assert resp.status_code == 502, resp.text
        assert resp.json()["detail"] == detail
        assert _PROVIDER_TEXT not in resp.text
        if retry_after:
            assert resp.headers["retry-after"] == str(TAX_ADVISOR_RETRY_AFTER_SECONDS)
        else:
            assert "retry-after" not in resp.headers
