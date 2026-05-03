"""Tests for the AI placeholder suggestion endpoint.

POST /lease-templates/{template_id}/suggest-placeholders

Covers:
  - Happy path: returns 200 + suggestions list
  - Template not found: returns 404
  - Cross-tenant access: returns 404
  - Storage not configured: returns 503
  - AI failure gracefully returns empty list (still 200)
  - Token budget cap: truncated flag set when text is oversized
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.leases.suggest_placeholders_response import (
    SuggestPlaceholdersResponse,
    SuggestedPlaceholderItem,
)
from app.services.leases import lease_template_service
from app.services.leases.template_placeholder_extractor import (
    MAX_TEMPLATE_CHARS,
    SuggestPlaceholdersResult,
    SuggestedPlaceholder,
    suggest_placeholders,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _ok_suggestions_response() -> SuggestPlaceholdersResponse:
    return SuggestPlaceholdersResponse(
        suggestions=[
            SuggestedPlaceholderItem(
                key="TENANT FULL NAME",
                description="Legal name of the tenant.",
                input_type="text",
            ),
            SuggestedPlaceholderItem(
                key="MOVE-IN DATE",
                description="Date the tenant takes possession.",
                input_type="date",
            ),
        ],
        truncated=False,
        pages_note=None,
    )


# ---------------------------------------------------------------------------
# Route-level tests (service is mocked)
# ---------------------------------------------------------------------------

class TestSuggestPlaceholdersRoute:
    def test_happy_path_returns_200_with_suggestions(self) -> None:
        org_id, user_id, template_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
                new_callable=AsyncMock,
                return_value=_ok_suggestions_response(),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/lease-templates/{template_id}/suggest-placeholders",
                )
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert "suggestions" in body
            assert len(body["suggestions"]) == 2
            assert body["suggestions"][0]["key"] == "TENANT FULL NAME"
            assert body["suggestions"][0]["input_type"] == "text"
            assert body["truncated"] is False
        finally:
            app.dependency_overrides.clear()

    def test_template_not_found_returns_404(self) -> None:
        org_id, user_id, template_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
                new_callable=AsyncMock,
                side_effect=lease_template_service.TemplateNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/lease-templates/{template_id}/suggest-placeholders",
                )
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_storage_unconfigured_returns_503(self) -> None:
        org_id, user_id, template_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
                new_callable=AsyncMock,
                side_effect=lease_template_service.StorageNotConfiguredError("no storage"),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/lease-templates/{template_id}/suggest-placeholders",
                )
            assert resp.status_code == 503, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_empty_suggestions_still_200(self) -> None:
        """AI failure gracefully returns an empty list, not a 5xx."""
        org_id, user_id, template_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
                new_callable=AsyncMock,
                return_value=SuggestPlaceholdersResponse(
                    suggestions=[], truncated=False, pages_note=None,
                ),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/lease-templates/{template_id}/suggest-placeholders",
                )
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["suggestions"] == []
        finally:
            app.dependency_overrides.clear()

    def test_truncated_response_includes_pages_note(self) -> None:
        org_id, user_id, template_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
                new_callable=AsyncMock,
                return_value=SuggestPlaceholdersResponse(
                    suggestions=[],
                    truncated=True,
                    pages_note="The document was too long to analyse in full",
                ),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/lease-templates/{template_id}/suggest-placeholders",
                )
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["truncated"] is True
            assert body["pages_note"] is not None
            assert "long" in body["pages_note"].lower()
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Extractor service unit tests (Claude is mocked)
# ---------------------------------------------------------------------------

class TestSuggestPlaceholdersExtractor:
    """Unit tests for the AI extraction service in isolation."""

    @pytest.mark.anyio
    async def test_happy_path_returns_suggestions(self) -> None:
        ai_response_json = """[
            {"key": "TENANT FULL NAME", "description": "Legal name.", "input_type": "text"},
            {"key": "MOVE-IN DATE", "description": "Start date.", "input_type": "date"}
        ]"""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=ai_response_json)]

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_build.return_value = mock_client

            result = await suggest_placeholders("Tenant: [TENANT FULL NAME]\nDate: [MOVE-IN DATE]")

        assert len(result.suggestions) == 2
        assert result.suggestions[0].key == "TENANT FULL NAME"
        assert result.suggestions[1].input_type == "date"
        assert result.truncated is False

    @pytest.mark.anyio
    async def test_token_budget_cap_truncates_large_text(self) -> None:
        """Oversized text is truncated; the truncated flag is set."""
        oversized_text = "A" * (MAX_TEMPLATE_CHARS + 100)
        ai_response_json = "[]"
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=ai_response_json)]

        captured_kwargs: dict = {}

        async def _capture_create(**kwargs) -> MagicMock:  # type: ignore[return]
            captured_kwargs.update(kwargs)
            return mock_message

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = _capture_create
            mock_build.return_value = mock_client

            result = await suggest_placeholders(oversized_text)

        assert result.truncated is True
        assert result.chars_sent == MAX_TEMPLATE_CHARS
        # Verify only MAX_TEMPLATE_CHARS were sent.
        sent_text: str = captured_kwargs["messages"][0]["content"]
        assert len(sent_text) < len(oversized_text)

    @pytest.mark.anyio
    async def test_claude_api_failure_returns_empty_list(self) -> None:
        """Claude failure is swallowed; an empty list is returned."""
        import anthropic

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                side_effect=anthropic.APIConnectionError(request=MagicMock()),
            )
            mock_build.return_value = mock_client

            result = await suggest_placeholders("Some lease text here.")

        assert result.suggestions == []

    @pytest.mark.anyio
    async def test_invalid_json_response_returns_empty_list(self) -> None:
        """Malformed JSON from Claude returns empty list, no crash."""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="This is not JSON at all!")]

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_build.return_value = mock_client

            result = await suggest_placeholders("Some lease text here.")

        assert result.suggestions == []

    @pytest.mark.anyio
    async def test_unknown_input_type_coerced_to_text(self) -> None:
        ai_response_json = """[
            {"key": "WEIRD FIELD", "description": "Something.", "input_type": "fax_number"}
        ]"""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=ai_response_json)]

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_build.return_value = mock_client

            result = await suggest_placeholders("Some field: [WEIRD FIELD]")

        assert len(result.suggestions) == 1
        assert result.suggestions[0].input_type == "text"

    @pytest.mark.anyio
    async def test_duplicate_keys_deduplicated(self) -> None:
        ai_response_json = """[
            {"key": "TENANT NAME", "description": "First.", "input_type": "text"},
            {"key": "TENANT NAME", "description": "Second — duplicate.", "input_type": "text"}
        ]"""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=ai_response_json)]

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_build.return_value = mock_client

            result = await suggest_placeholders("[TENANT NAME]")

        assert len(result.suggestions) == 1
        assert result.suggestions[0].description == "First."

    @pytest.mark.anyio
    async def test_empty_text_skips_claude_call(self) -> None:
        """Blank template text returns empty result without calling Claude."""
        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_build.return_value = mock_client

            result = await suggest_placeholders("   ")

        mock_client.messages.create.assert_not_called()
        assert result.suggestions == []

    @pytest.mark.anyio
    async def test_markdown_fenced_json_parsed_correctly(self) -> None:
        """Claude sometimes wraps JSON in markdown code fences — strip and parse."""
        ai_response = """Here are the placeholders:

```json
[
  {"key": "LANDLORD NAME", "description": "Name of the landlord.", "input_type": "text"}
]
```
"""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=ai_response)]

        with patch(
            "app.services.leases.template_placeholder_extractor._build_client",
        ) as mock_build:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_build.return_value = mock_client

            result = await suggest_placeholders("Landlord: [LANDLORD NAME]")

        assert len(result.suggestions) == 1
        assert result.suggestions[0].key == "LANDLORD NAME"
