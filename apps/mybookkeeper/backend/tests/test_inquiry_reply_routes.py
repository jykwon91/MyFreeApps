"""HTTP route tests for POST /inquiries/{id}/reply.

Covers happy path + every failure mode the route maps to specific HTTP codes.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.services.inquiries import inquiry_reply_service
from app.services.inquiries import reply_send_error_details as details
from app.services.inquiries.reply_exceptions import (
    InquiryReplyAuthExpiredError,
    InquiryReplyInProgressError,
    InquiryReplyRequestIdReusedError,
    InquiryReplySentFromOtherGmailError,
    InquiryReplySentNotRecordedError,
    InquiryReplyUnconfirmedError,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_message(inquiry_id: uuid.UUID) -> InquiryMessageResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return InquiryMessageResponse(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        direction="outbound",
        channel="email",
        from_address="host@gmail.com",
        to_address="alice@example.com",
        subject="Re: Cozy Room",
        parsed_body="Hi Alice",
        email_message_id="<gmail-id-123@mail.gmail.com>",
        sent_at=now,
        created_at=now,
    )


class TestSendReply:
    @pytest.mark.asyncio
    async def test_happy_path_returns_201_with_message(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        message = _build_message(inquiry_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            return_value=message,
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "Re: Cozy Room", "body": "Hi Alice"},
                )
                assert r.status_code == 201
                assert r.json()["direction"] == "outbound"
                assert r.json()["channel"] == "email"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_inquiry_missing(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            side_effect=LookupError("not found"),
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b"},
                )
                assert r.status_code == 404
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_422_when_no_gmail_integration(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            side_effect=inquiry_reply_service.InquiryReplyMissingIntegrationError(
                "Connect Gmail before replying to inquiries.",
            ),
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b"},
                )
                assert r.status_code == 422
                assert "Connect Gmail" in r.json()["detail"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_422_when_send_scope_missing(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            side_effect=inquiry_reply_service.InquiryReplyMissingSendScopeError(
                "Reconnect Gmail to enable replies.",
            ),
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b"},
                )
                assert r.status_code == 422
                assert "Reconnect Gmail" in r.json()["detail"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_422_when_inquirer_has_no_email(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            side_effect=inquiry_reply_service.InquiryReplyMissingRecipientError(
                "Cannot send a reply — the inquirer has no email address.",
            ),
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b"},
                )
                assert r.status_code == 422
                assert r.json()["detail"] == "reply_no_recipient"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_502_when_gmail_send_fails(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            side_effect=inquiry_reply_service.InquiryReplySendFailedError(
                "Gmail rejected the message",
            ),
        ):
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b"},
                )
                assert r.status_code == 502
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "subject",
        ["Re: Cozy\nBcc: evil@bad.com", "Line one\r\nLine two", "Re: Cozy\u2028Room", "Re: Cozy\x0bRoom", "   "],
    )
    async def test_a_subject_that_cant_be_an_email_header_is_refused_before_sending(self, subject: str) -> None:
        app.dependency_overrides[require_write_access] = lambda: _ctx(uuid.uuid4(), uuid.uuid4())
        with patch("app.api.inquiries.inquiry_reply_service.send_reply") as send_reply:
            with TestClient(app) as client:
                r = client.post(f"/inquiries/{uuid.uuid4()}/reply", json={"subject": subject, "body": "Hi"})
        app.dependency_overrides.clear()
        assert r.status_code == 422
        send_reply.assert_not_called()

    @pytest.mark.asyncio
    async def test_extra_fields_rejected(self) -> None:
        """Body must not include unexpected keys."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with TestClient(app) as client:
            r = client.post(
                f"/inquiries/{inquiry_id}/reply",
                json={
                    "subject": "s", "body": "b",
                    "from_address": "evil@bad.com",
                },
            )
            assert r.status_code == 422
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("error", "status", "detail"),
        [
            (InquiryReplyInProgressError("busy"), 409, details.REPLY_SEND_IN_PROGRESS),
            (InquiryReplyRequestIdReusedError("reused"), 422, details.REPLY_REQUEST_ID_REUSED),
            (InquiryReplyAuthExpiredError("expired"), 503, details.REPLY_GMAIL_REAUTH_REQUIRED),
            # Not 502: phones already in the stores read 502 as "nothing was sent".
            (InquiryReplyUnconfirmedError("timeout"), 504, details.REPLY_SEND_UNCONFIRMED),
            (InquiryReplySentNotRecordedError("db"), 500, details.REPLY_SENT_NOT_RECORDED),
        ],
    )
    async def test_send_claim_outcomes_map_to_stable_codes(
        self, error: Exception, status: int, detail: str,
    ) -> None:
        app.dependency_overrides[require_write_access] = lambda: _ctx(uuid.uuid4(), uuid.uuid4())
        with patch("app.api.inquiries.inquiry_reply_service.send_reply", side_effect=error):
            with TestClient(app, raise_server_exceptions=False) as client:
                r = client.post(f"/inquiries/{uuid.uuid4()}/reply", json={"subject": "s", "body": "b"})
        app.dependency_overrides.clear()
        assert r.status_code == status
        assert r.json()["detail"] == detail

    @pytest.mark.asyncio
    async def test_client_request_id_reaches_the_service(self) -> None:
        inquiry_id, key = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(uuid.uuid4(), uuid.uuid4())
        with patch(
            "app.api.inquiries.inquiry_reply_service.send_reply",
            return_value=_build_message(inquiry_id),
        ) as send_reply:
            with TestClient(app) as client:
                r = client.post(
                    f"/inquiries/{inquiry_id}/reply",
                    json={"subject": "s", "body": "b", "client_request_id": str(key)},
                )
        app.dependency_overrides.clear()
        assert r.status_code == 201
        assert send_reply.call_args.args[3].client_request_id == key


@pytest.mark.asyncio
async def test_reply_from_another_gmail_names_the_account() -> None:
    app.dependency_overrides[require_write_access] = lambda: _ctx(uuid.uuid4(), uuid.uuid4())
    with patch(
        "app.api.inquiries.inquiry_reply_service.send_reply",
        side_effect=InquiryReplySentFromOtherGmailError("old@gmail.com"),
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            r = client.post(f"/inquiries/{uuid.uuid4()}/reply", json={"subject": "s", "body": "b"})
    app.dependency_overrides.clear()
    assert r.status_code == 409
    assert r.json()["detail"] == {
        "code": details.REPLY_SENT_FROM_OTHER_GMAIL,
        "sender_gmail_address": "old@gmail.com",
    }
