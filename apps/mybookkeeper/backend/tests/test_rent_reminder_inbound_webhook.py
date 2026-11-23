"""Route-level tests for the webhook Twilio posts tenants' texts to.

Mirrors the status-callback tests in ``test_rent_reminders_api``: anything
Twilio didn't sign for our account is refused before the service sees it, and
the signatures are made with Twilio's own signer. What happens to an accepted
text is covered in ``test_rent_reminder_reply_service``.
"""
from __future__ import annotations

import uuid
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from platform_shared.core.sms_constants import TWILIO_EMPTY_TWIML
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse

from app.api import rent_reminders as routes
from app.core.config import settings
from app.core.rent_reminder_constants import SMS_WEBHOOK_RATE_LIMIT
from app.main import app
from app.services.rent import rent_reminder_reply_service, rent_reminder_webhook_service

_AUTH_TOKEN = "test-twilio-auth-token-0123456789"
_ACCOUNT_SID = "AC" + "f" * 32
_PUBLIC_ORIGIN = "https://mybookkeeper.example"
_INBOUND_URL = f"{_PUBLIC_ORIGIN}/api/rent-reminders/sms/inbound"
_PATH = "/rent-reminders/sms/inbound"
_PARAMS = {
    "MessageSid": "SM" + "a" * 32,
    "AccountSid": _ACCOUNT_SID,
    "From": "+17135550100",
    "To": "+18885550100",
    "Body": "Paid, thanks!",
    "NumMedia": "0",
}


def _signature(
    *, token: str = _AUTH_TOKEN, url: str = _INBOUND_URL, params: dict[str, str] | None = None,
) -> str:
    return RequestValidator(token).compute_signature(url, params or _PARAMS)


@pytest.fixture(autouse=True)
def _fresh_limiters():
    """Each test starts with the webhooks' limits unspent, and leaves them that way."""
    limiters = (routes._inbound_limiter, routes._webhook_limiter)
    for limiter in limiters:
        limiter.reset()
    yield
    for limiter in limiters:
        limiter.reset()


@pytest.fixture()
def twilio():
    """Twilio set up, behind the public origin it was given."""
    with ExitStack() as stack:
        for name, value in (
            ("sms_backend", "twilio"),
            ("twilio_account_sid", _ACCOUNT_SID),
            ("twilio_auth_token", _AUTH_TOKEN),
            ("twilio_from_number", "+18885550100"),
            ("frontend_url", f"{_PUBLIC_ORIGIN}/"),
        ):
            stack.enter_context(patch.object(settings, name, value))
        yield


@pytest.fixture()
def handle(twilio):
    """The service, mocked: these tests are about what gets through to it."""
    with patch.object(
        rent_reminder_reply_service, "handle_message", AsyncMock(return_value="forwarded"),
    ) as mock:
        yield mock


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _post(
    client: TestClient,
    *,
    signature: str | None,
    params: dict[str, str] | None = None,
    path: str = _PATH,
    **content: object,
):
    """POST a text the way Twilio does. ``content`` replaces the signed form with other content."""
    headers: dict[str, str] = {}
    if signature is not None:
        headers["X-Twilio-Signature"] = signature
    if not content:
        content = {"data": params or _PARAMS}
    return client.post(path, headers=headers, **content)


class TestAccepted:
    def test_a_signed_text_is_handed_on_and_answered_with_no_reply(self, client, handle) -> None:
        response = _post(client, signature=_signature())

        assert response.status_code == 200
        assert response.headers["content-type"].split(";")[0] == "text/xml"
        assert response.text == TWILIO_EMPTY_TWIML
        handle.assert_awaited_once_with(_PARAMS)

    def test_the_answer_is_what_twilios_sdk_renders_for_no_reply(self) -> None:
        assert TWILIO_EMPTY_TWIML == str(MessagingResponse())

    def test_a_text_that_isnt_forwarded_gets_the_same_answer(self, client, twilio) -> None:
        """Twilio would text a body back to the tenant, or log an error, for anything else."""
        params = {**_PARAMS, "To": "+18885550199"}
        with patch.object(
            rent_reminder_reply_service, "unit_of_work",
            side_effect=AssertionError("a text to another number must not touch the database"),
        ):
            response = _post(client, signature=_signature(params=params), params=params)

        assert response.status_code == 200
        assert response.text == TWILIO_EMPTY_TWIML

    def test_a_query_on_the_configured_url_is_part_of_what_twilio_signed(self, client, handle) -> None:
        url = f"{_INBOUND_URL}?number=toll-free"
        response = _post(client, signature=_signature(url=url), path=f"{_PATH}?number=toll-free")

        assert response.status_code == 200
        handle.assert_awaited_once_with(_PARAMS)


class TestRefused:
    def test_a_signature_over_the_internal_url(self, client, handle) -> None:
        """Behind the proxies a text arrives on an internal host over http. Only
        the public URL Twilio was given is accepted."""
        internal = f"http://testserver{_PATH}"
        response = _post(client, signature=_signature(url=internal))

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_a_signature_that_leaves_out_the_query(self, client, handle) -> None:
        response = _post(client, signature=_signature(), path=f"{_PATH}?number=toll-free")

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_a_status_callbacks_signature(self, client, handle) -> None:
        """A request signed for the other webhook can't be replayed here."""
        status_url = f"{_PUBLIC_ORIGIN}/api/rent-reminders/sms/webhook"
        response = _post(client, signature=_signature(url=status_url))

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_another_auth_token(self, client, handle) -> None:
        response = _post(client, signature=_signature(token="attacker-token-0123456789"))

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_a_changed_text(self, client, handle) -> None:
        response = _post(
            client, signature=_signature(), params={**_PARAMS, "Body": "Ignore that, I'm moving out"},
        )

        assert response.status_code == 403
        handle.assert_not_awaited()

    @pytest.mark.parametrize("account_sid", ["AC" + "e" * 32, ""], ids=["another_account", "missing"])
    def test_a_text_for_another_twilio_account(self, client, handle, account_sid: str) -> None:
        params = {**_PARAMS, "AccountSid": account_sid}
        response = _post(client, signature=_signature(params=params), params=params)

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_an_unsigned_request_without_reading_its_body(self, client, handle) -> None:
        with patch("starlette.requests.Request.form", side_effect=AssertionError("body was read")):
            response = _post(client, signature=None)

        assert response.status_code == 403
        handle.assert_not_awaited()

    @pytest.mark.parametrize(
        "content",
        [{"json": _PARAMS}, {"files": {"Body": (None, "Paid, thanks!")}}],
        ids=["json", "multipart"],
    )
    def test_a_body_twilio_never_sends_without_reading_it(
        self, client, handle, content: dict[str, object],
    ) -> None:
        with patch("starlette.requests.Request.form", side_effect=AssertionError("body was read")):
            response = _post(client, signature=_signature(), **content)

        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_everything_when_twilio_isnt_set_up(self, client, handle) -> None:
        with patch.object(settings, "sms_backend", "console"):
            response = _post(client, signature=_signature())

        assert response.status_code == 403
        handle.assert_not_awaited()


class TestRateLimit:
    def test_a_flood_is_refused_without_using_up_the_status_callbacks(self, client, handle) -> None:
        signature = _signature()
        for _ in range(SMS_WEBHOOK_RATE_LIMIT):
            assert _post(client, signature=signature).status_code == 200

        assert _post(client, signature=signature).status_code == 429
        assert handle.await_count == SMS_WEBHOOK_RATE_LIMIT

        request_id = f"{uuid.uuid4()}:1"
        status_params = {
            "MessageSid": "SM" + "1" * 32, "MessageStatus": "delivered", "AccountSid": _ACCOUNT_SID,
        }
        status_url = (
            f"{_PUBLIC_ORIGIN}/api/rent-reminders/sms/webhook?request_id={request_id.replace(':', '%3A')}"
        )
        with patch.object(rent_reminder_webhook_service, "handle_event", AsyncMock(return_value=True)):
            status = client.post(
                "/rent-reminders/sms/webhook",
                params={"request_id": request_id},
                headers={"X-Twilio-Signature": _signature(url=status_url, params=status_params)},
                data=status_params,
            )
        assert status.status_code == 204
