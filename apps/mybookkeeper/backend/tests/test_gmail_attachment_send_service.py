"""Gmail receipt sends: failure classification, Message-ID, lookup, transport.

A receipt must never be emailed twice, so the send has to tell "Gmail
definitely refused" (safe to retry) apart from "Gmail may have sent it"
(look in Sent first). These pin that split and the lookup used to settle it.
"""
from __future__ import annotations

import socket
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httplib2
import pytest
import requests
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from app.services.email import gmail_attachment_send_service, gmail_request_executor, gmail_service
from app.services.email.constants import GMAIL_HTTP_TIMEOUT_SECONDS, GMAIL_SEND_URL
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
    GmailSendScopeError,
)
from app.services.leases.receipt_send_constants import RECEIPT_SEND_CLAIM_STALE_AFTER
from tests.gmail_send_fakes import fake_gmail_post, gmail_response

MESSAGE_ID = "<receipt-attempt-1@mybookkeeper.app>"


class _FakeIntegration:
    def __init__(self) -> None:
        self.access_token = "tok"
        self.refresh_token = "rt"
        self.organization_id = uuid.uuid4()


def _http_error(status: int) -> HttpError:
    resp = MagicMock()
    resp.status = status
    return HttpError(resp, b"err")


def _forbidden(reason: str) -> requests.Response:
    return gmail_response(403, {"error": {"code": 403, "errors": [{"reason": reason}]}})


async def _send() -> str:
    return await gmail_attachment_send_service.send_message_with_attachment(
        _FakeIntegration(),
        from_address="host@example.com",
        to_address="tenant@example.com",
        subject="Rent receipt",
        body="Attached",
        attachment_bytes=b"%PDF-1.4",
        attachment_filename="receipt.pdf",
        attachment_content_type="application/pdf",
        message_id_header=MESSAGE_ID,
    )


class TestSendUsesCallersMessageId:
    @pytest.mark.asyncio
    async def test_message_id_header_is_the_one_given(self) -> None:
        with fake_gmail_post(gmail_response(200, {"id": "gmail-1"})) as gmail:
            sent_id = await _send()
        assert sent_id == "gmail-1"
        assert gmail.message()["Message-ID"] == MESSAGE_ID
        assert len(gmail.raws) == 1


class TestDefiniteRefusals:
    """Nothing was sent: callers may release the receipt and retry."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [400, 404, 429])
    async def test_4xx_is_a_plain_send_error(self, status: int) -> None:
        with fake_gmail_post(gmail_response(status, {})):
            with pytest.raises(GmailSendError) as info:
                await _send()
        assert not isinstance(info.value, GmailSendOutcomeUnknownError)

    @pytest.mark.asyncio
    async def test_403_is_scope_error(self) -> None:
        with fake_gmail_post(_forbidden("insufficientPermissions")):
            with pytest.raises(GmailSendScopeError):
                await _send()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("reason", ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"])
    async def test_403_rate_limit_is_not_a_reconnect(self, reason: str) -> None:
        with fake_gmail_post(_forbidden(reason)):
            with pytest.raises(GmailSendError) as info:
                await _send()
        assert type(info.value) is GmailSendError

    @pytest.mark.asyncio
    async def test_403_rate_limit_in_details_shape(self) -> None:
        body = {"error": {"code": 403, "details": [{"reason": "RATE_LIMIT_EXCEEDED"}, {"reason": "rateLimitExceeded"}]}}
        with fake_gmail_post(gmail_response(403, body)):
            with pytest.raises(GmailSendError) as info:
                await _send()
        assert type(info.value) is GmailSendError

    @pytest.mark.asyncio
    async def test_403_without_a_json_body_is_scope_error(self) -> None:
        with fake_gmail_post(gmail_response(403, b"<html>forbidden</html>")):
            with pytest.raises(GmailSendScopeError):
                await _send()

    @pytest.mark.asyncio
    async def test_401_marks_needs_reauth(self) -> None:
        mark = AsyncMock()
        with (
            patch.object(gmail_request_executor, "mark_integration_needs_reauth", mark),
            fake_gmail_post(gmail_response(401, {})),
        ):
            with pytest.raises(GmailReauthRequiredError):
                await _send()
        mark.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_refresh_error_marks_needs_reauth(self) -> None:
        mark = AsyncMock()
        with (
            patch.object(gmail_request_executor, "mark_integration_needs_reauth", mark),
            fake_gmail_post(RefreshError("invalid_grant")),
        ):
            with pytest.raises(GmailReauthRequiredError):
                await _send()
        mark.assert_awaited_once()


class TestOutcomeUnknown:
    """Gmail may have delivered it: callers must not retry blindly."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [500, 502, 503])
    async def test_5xx(self, status: int) -> None:
        with fake_gmail_post(gmail_response(status, {})):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "error",
        [
            requests.Timeout("read timed out"),
            requests.ConnectionError("connection reset"),
            socket.timeout("timed out"),
            ConnectionResetError(),
        ],
    )
    async def test_transport_errors(self, error: BaseException) -> None:
        with fake_gmail_post(error):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [302, 307, 308])
    async def test_redirect_is_unknown_never_followed(self, status: int) -> None:
        with fake_gmail_post(gmail_response(status, b"")):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    async def test_success_without_id(self) -> None:
        with fake_gmail_post(gmail_response(200, {"labelIds": ["SENT"]})):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    async def test_success_with_unreadable_body(self) -> None:
        with fake_gmail_post(gmail_response(200, b"not json")):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()


class TestAfterGmailAccepted:
    @pytest.mark.asyncio
    async def test_token_save_failure_still_returns_the_id(self) -> None:
        def _refresh(creds: Credentials) -> None:
            creds.token = "rotated"

        with (
            patch.object(
                gmail_request_executor, "persist_refreshed_token",
                AsyncMock(side_effect=ConnectionError("db down")),
            ),
            fake_gmail_post(gmail_response(200, {"id": "gmail-1"}), on_post=_refresh),
        ):
            assert await _send() == "gmail-1"

    @pytest.mark.asyncio
    async def test_refreshed_token_is_saved(self) -> None:
        persist = AsyncMock()

        def _refresh(creds: Credentials) -> None:
            creds.token = "rotated"

        with (
            patch.object(gmail_request_executor, "persist_refreshed_token", persist),
            fake_gmail_post(gmail_response(200, {"id": "gmail-1"}), on_post=_refresh),
        ):
            await _send()
        _, creds, prior = persist.await_args.args
        assert creds.token == "rotated"
        assert prior == "tok"


class TestSendTransport:
    def test_posts_once_with_a_timeout_through_requests(self) -> None:
        calls: list[dict[str, Any]] = []

        class _Session:
            def __init__(self, creds: Credentials) -> None:
                self.creds = creds

            def __enter__(self) -> "_Session":
                return self

            def __exit__(self, *exc: object) -> None:
                return None

            def post(self, url: str, **kwargs: Any) -> requests.Response:
                calls.append({"url": url, **kwargs})
                return gmail_response(200, {"id": "x"})

        creds = Credentials(token="tok")
        with patch.object(gmail_request_executor, "AuthorizedSession", _Session):
            gmail_request_executor.post_message_send(creds, "cmF3")
        assert calls == [{
            "url": GMAIL_SEND_URL,
            "json": {"raw": "cmF3"},
            "timeout": GMAIL_HTTP_TIMEOUT_SECONDS,
            "allow_redirects": False,
        }]

    def test_requests_does_not_retry_a_dropped_post(self) -> None:
        # httplib2 silently re-sends a POST whose connection drops; requests'
        # default adapter makes no retries at all.
        with gmail_request_executor.AuthorizedSession(Credentials(token="tok")) as session:
            adapter = session.get_adapter(GMAIL_SEND_URL)
        assert adapter.max_retries.total == 0


def _service_whose_list(execute: Any, captured: dict[str, Any]) -> MagicMock:
    chain = MagicMock()
    if isinstance(execute, BaseException):
        chain.execute.side_effect = execute
    else:
        chain.execute.return_value = execute

    def _list(**kwargs: Any) -> MagicMock:
        captured.update(kwargs)
        return chain

    service = MagicMock()
    service.users.return_value.messages.return_value.list = _list
    return service


async def _find(service: MagicMock, *, attachment_filename: str | None = None) -> str | None:
    with (
        patch.object(
            gmail_attachment_send_service, "get_gmail_service",
            return_value=(service, MagicMock(token="t0")),
        ),
        patch.object(gmail_attachment_send_service, "persist_refreshed_token", AsyncMock()),
    ):
        return await gmail_attachment_send_service.find_sent_message_id(
            _FakeIntegration(),
            MESSAGE_ID,
            attachment_filename=attachment_filename,
            to_address="tenant@example.com",
        )


def _service_answering(answers: dict[str, dict[str, Any]], queries: list[str]) -> MagicMock:
    def _list(**kwargs: Any) -> MagicMock:
        queries.append(kwargs["q"])
        assert kwargs["includeSpamTrash"] is True
        chain = MagicMock()
        chain.execute.return_value = answers.get(kwargs["q"], {"resultSizeEstimate": 0})
        return chain

    service = MagicMock()
    service.users.return_value.messages.return_value.list = _list
    return service


class TestFindSentMessage:
    @pytest.mark.asyncio
    async def test_searches_by_rfc822_message_id_including_trash(self) -> None:
        captured: dict[str, Any] = {}
        found = await _find(_service_whose_list({"messages": [{"id": "gmail-9"}]}, captured))
        assert found == "gmail-9"
        assert captured["q"] == "rfc822msgid:receipt-attempt-1@mybookkeeper.app"
        assert captured["includeSpamTrash"] is True

    @pytest.mark.asyncio
    async def test_not_found_is_none(self) -> None:
        assert await _find(_service_whose_list({"resultSizeEstimate": 0}, {})) is None

    @pytest.mark.asyncio
    async def test_falls_back_to_the_attempts_attachment(self) -> None:
        queries: list[str] = []
        service = _service_answering(
            {'from:me to:"tenant@example.com" filename:"receipt-R-2026-0003.pdf"': {"messages": [{"id": "gmail-7"}]}},
            queries,
        )
        found = await _find(service, attachment_filename="receipt-R-2026-0003.pdf")
        assert found == "gmail-7"
        assert queries == [
            "rfc822msgid:receipt-attempt-1@mybookkeeper.app",
            'from:me to:"tenant@example.com" filename:"receipt-R-2026-0003.pdf"',
        ]

    @pytest.mark.asyncio
    async def test_message_id_hit_skips_the_fallback(self) -> None:
        queries: list[str] = []
        service = _service_answering(
            {"rfc822msgid:receipt-attempt-1@mybookkeeper.app": {"messages": [{"id": "gmail-9"}]}},
            queries,
        )
        assert await _find(service, attachment_filename="receipt-R-2026-0003.pdf") == "gmail-9"
        assert len(queries) == 1

    @pytest.mark.asyncio
    async def test_neither_search_finds_it(self) -> None:
        queries: list[str] = []
        assert await _find(
            _service_answering({}, queries), attachment_filename="receipt-R-2026-0003.pdf",
        ) is None
        assert len(queries) == 2

    def test_fallback_query_cannot_be_broken_by_quotes(self) -> None:
        query = gmail_attachment_send_service.sent_attachment_query('a"b.pdf', 't"@x.com')
        assert query == 'from:me to:"t@x.com" filename:"ab.pdf"'

    @pytest.mark.asyncio
    async def test_api_error_raises_never_reads_as_not_found(self) -> None:
        with pytest.raises(HttpError):
            await _find(_service_whose_list(_http_error(500), {}))

    @pytest.mark.asyncio
    async def test_401_marks_needs_reauth(self) -> None:
        mark = AsyncMock()
        with patch.object(gmail_attachment_send_service, "mark_integration_needs_reauth", mark):
            with pytest.raises(GmailReauthRequiredError):
                await _find(_service_whose_list(_http_error(401), {}))
        mark.assert_awaited_once()


class TestClientTimeout:
    def test_every_gmail_client_has_a_socket_timeout(self) -> None:
        service, _ = gmail_service.get_gmail_service("tok", "rt")
        inner = service._http.http  # AuthorizedHttp wraps an httplib2.Http
        assert isinstance(inner, httplib2.Http)
        assert inner.timeout == GMAIL_HTTP_TIMEOUT_SECONDS

    def test_refreshes_still_land_on_the_returned_credentials(self) -> None:
        service, creds = gmail_service.get_gmail_service("tok", "rt")
        assert isinstance(creds, Credentials)
        assert service._http.credentials is creds

    def test_stale_claim_window_far_exceeds_a_gmail_request(self) -> None:
        # A claim is only settled once the request that took it can't still
        # be talking to Gmail.
        assert RECEIPT_SEND_CLAIM_STALE_AFTER.total_seconds() >= 10 * GMAIL_HTTP_TIMEOUT_SECONDS

