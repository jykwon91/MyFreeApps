"""A document download that can't be served says why in our words, never a decoder's.

The route maps ``DocumentSourceUnavailableError`` to a 404 with its fixed
detail. It used to map every ValueError, so a Gmail attachment that wouldn't
base64-decode ("Incorrect padding") or an ``.eml`` the parser choked on came
back as the 404's detail.
"""
from __future__ import annotations

import binascii
import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api import documents as documents_api
from app.core.context import RequestContext
from app.core.document_constants import EMAIL_GONE_FROM_GMAIL_DETAIL
from app.models.organization.organization_member import OrgRole
from app.services.documents.document_source_unavailable_error import DocumentSourceUnavailableError

pytestmark = pytest.mark.asyncio


def _ctx() -> RequestContext:
    return RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)


async def test_unavailable_source_is_a_404_in_our_words(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        documents_api.document_query_service, "get_document_download",
        AsyncMock(side_effect=DocumentSourceUnavailableError(EMAIL_GONE_FROM_GMAIL_DETAIL)),
    )
    with pytest.raises(HTTPException) as exc_info:
        await documents_api.download_document(uuid.uuid4(), _ctx())
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == EMAIL_GONE_FROM_GMAIL_DETAIL


async def test_a_decoding_error_is_not_sent_as_the_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        documents_api.document_query_service, "get_document_download",
        AsyncMock(side_effect=binascii.Error("Incorrect padding")),
    )
    with pytest.raises(binascii.Error):
        await documents_api.download_document(uuid.uuid4(), _ctx())
