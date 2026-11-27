"""Route-level tests for the rent-reminders API.

Services are mocked where the route is only mapping results; the arithmetic and
sending are covered by ``test_rent_reminder_math`` and
``test_rent_reminder_dispatch``. What is checked here is the HTTP contract:
happy-path shapes, validation, refusing text reminders when SMS is not set up,
and that the public webhook rejects anything Twilio did not sign.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import ExitStack
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from app.core.config import settings
from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.rent.rent_reminder_overview_response import RentReminderOverviewResponse
from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.schemas.rent.rent_reminder_sms_status import RentReminderSmsStatus
from app.services.rent import rent_reminder_dispatch_service, rent_reminder_service
from app.services.system import sms_service

_AUTH_TOKEN = "test-twilio-auth-token-0123456789"
_PUBLIC_ORIGIN = "https://mybookkeeper.example"
_WEBHOOK_URL = f"{_PUBLIC_ORIGIN}/api/rent-reminders/sms/webhook"
_SUNDAY_PLAN = {
    "frequency": "weekly",
    "due_weekday": 6,
    "send_days_before": 1,
    "send_time": "18:00",
    "timezone": "America/Chicago",
    "email_enabled": True,
    "sms_enabled": False,
    "payment_instructions": "Zelle to jason@example.com",
}


def _ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )


def _override_auth() -> None:
    ctx = _ctx()
    for dep in (current_org_member, require_write_access, reject_demo_org_write):
        app.dependency_overrides[dep] = lambda ctx=ctx: ctx


class TestOverview:
    def test_happy_path(self) -> None:
        _override_auth()
        try:
            overview = RentReminderOverviewResponse(
                plan=None,
                sms=RentReminderSmsStatus(available=False, allowed=False),
                tenant_has_email=True,
                tenant_has_phone=True,
            )
            with patch(
                "app.api.rent_reminders.rent_reminder_service.get_overview",
                AsyncMock(return_value=overview),
            ):
                response = TestClient(app).get(f"/rent-reminders/tenants/{uuid.uuid4()}")
            assert response.status_code == 200
            assert response.json()["sms"]["available"] is False
            assert response.json()["sms"]["allowed"] is False
            assert response.json()["plan"] is None
        finally:
            app.dependency_overrides.clear()


class TestPlanValidation:
    def test_weekly_plan_needs_a_weekday(self) -> None:
        _override_auth()
        try:
            body = {**_SUNDAY_PLAN, "due_weekday": None}
            response = TestClient(app).post(
                f"/rent-reminders/tenants/{uuid.uuid4()}/plan", json=body,
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_send_time_outside_daytime_window_rejected(self) -> None:
        _override_auth()
        try:
            body = {**_SUNDAY_PLAN, "send_time": "21:30"}
            response = TestClient(app).post(
                f"/rent-reminders/tenants/{uuid.uuid4()}/plan", json=body,
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_enabling_sms_when_unconfigured_is_422(self) -> None:
        _override_auth()
        try:
            body = {**_SUNDAY_PLAN, "sms_enabled": True}
            with patch.object(sms_service, "is_configured", lambda: False):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/plan", json=body,
                )
            assert response.status_code == 422
            assert "Text reminders" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.parametrize(("method", "service"), [("post", "create_plan"), ("put", "update_plan")])
    def test_texts_the_owner_may_not_send_are_422(self, method: str, service: str) -> None:
        _override_auth()
        try:
            refused = rent_reminder_service.SmsNotAllowedError(rent_reminder_service.SMS_NOT_ALLOWED_MESSAGE)
            with patch(
                f"app.api.rent_reminders.rent_reminder_service.{service}",
                AsyncMock(side_effect=refused),
            ):
                response = getattr(TestClient(app), method)(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/plan",
                    json={**_SUNDAY_PLAN, "sms_enabled": True},
                )
            assert response.status_code == 422
            assert response.json()["detail"] == rent_reminder_service.SMS_NOT_ALLOWED_MESSAGE
        finally:
            app.dependency_overrides.clear()


class TestSendNow:
    def test_happy_path(self) -> None:
        _override_auth()
        try:
            sent = RentReminderSendResponse(
                id=uuid.uuid4(),
                due_date=_dt.date(2026, 11, 1),
                channel="email",
                status="sent",
                amount="300.00",
                created_at=_dt.datetime.now(_dt.timezone.utc),
            )
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(return_value=[sent, sent.model_copy(update={"channel": "sms", "status": "sent_to_provider"})]),
            ) as send_now:
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 200
            assert [(r["channel"], r["status"]) for r in response.json()] == [
                ("email", "sent"), ("sms", "sent_to_provider"),
            ]
            assert "channel" not in send_now.call_args.kwargs
            assert send_now.call_args.kwargs["expected_due_date"] == _dt.date(2026, 11, 1)
            assert send_now.call_args.kwargs["expected_amount"] == Decimal("300.00")
            assert send_now.call_args.kwargs["expected_message"] == _SHOWN["message"]
            assert send_now.call_args.kwargs["expected_channels"] == ["email", "sms"]
            assert send_now.call_args.kwargs["confirmed_possibly_sent"] == []
        finally:
            app.dependency_overrides.clear()

    def test_texts_the_owner_may_not_send_are_422(self) -> None:
        _override_auth()
        try:
            refused = rent_reminder_service.SmsNotAllowedError(rent_reminder_service.SMS_NOT_ALLOWED_MESSAGE)
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=refused),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 422
            assert response.json()["detail"] == rent_reminder_service.SMS_NOT_ALLOWED_MESSAGE
        finally:
            app.dependency_overrides.clear()

    def test_a_changed_reminder_is_412(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=rent_reminder_dispatch_service.ReminderChangedError("changed")),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 412
        finally:
            app.dependency_overrides.clear()

    def test_an_ended_tenancy_is_422(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=rent_reminder_dispatch_service.TenancyEndedError("ended")),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.parametrize(
        "change",
        [{"channels": []}, {"channels": ["pigeon"]}, {"amount": "NaN"}, {"amount": "1.234"}],
    )
    def test_nonsense_is_refused(self, change) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(),
            ) as send_now:
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json={**_SHOWN, **change},
                )
            assert response.status_code == 422
            send_now.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_sending_without_saying_what_was_shown_is_refused(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(),
            ) as send_now:
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                )
            assert response.status_code == 422
            send_now.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_already_sent_is_409(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=rent_reminder_dispatch_service.ReminderAlreadySentError("already sent")),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 409
        finally:
            app.dependency_overrides.clear()

    def test_a_possibly_sent_reminder_is_409_with_its_code(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=rent_reminder_dispatch_service.ReminderMayHaveBeenSentError("check")),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json=_SHOWN,
                )
            assert response.status_code == 409
            assert response.json()["detail"] == {"code": "REMINDER_MAY_HAVE_BEEN_SENT", "message": "check"}
        finally:
            app.dependency_overrides.clear()

    def test_confirming_a_possible_duplicate_is_passed_on(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(return_value=[]),
            ) as send_now:
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                    json={**_SHOWN, "confirmed_possibly_sent": [{"channel": "sms", "attempt": 2}]},
                )
            assert response.status_code == 200
            assert send_now.call_args.kwargs["confirmed_possibly_sent"] == [
                RentReminderPossiblySent(channel="sms", attempt=2),
            ]
        finally:
            app.dependency_overrides.clear()


_SHOWN = {
    "due_date": "2026-11-01",
    "amount": "300.00",
    "message": "Hi Sonu, reminder: rent of $300 is due on Sunday, Nov 1.",
    "channels": ["email", "sms"],
}


class TestWebhook:
    _request_id = f"{uuid.uuid4()}:1"
    _params = {
        "MessageSid": "SM" + "1" * 32,
        "MessageStatus": "delivered",
        "AccountSid": "AC" + "f" * 32,
    }

    def _signature(self, *, token: str = _AUTH_TOKEN, url: str | None = None, params: dict | None = None) -> str:
        url = url or f"{_WEBHOOK_URL}?request_id={self._request_id.replace(':', '%3A')}"
        return RequestValidator(token).compute_signature(url, params or self._params)

    def _post(
        self, headers: dict[str, str], *, params: dict | None = None, configured: bool = True,
        real_handler: bool = False, path: str | None = None, body: dict[str, object] | None = None,
    ):
        """POST a callback. ``path`` replaces the route and its query; ``body``
        replaces the signed form with other request content."""
        with ExitStack() as stack:
            for name, value in (
                ("sms_backend", "twilio" if configured else "console"),
                ("twilio_account_sid", "AC" + "f" * 32),
                ("twilio_auth_token", _AUTH_TOKEN),
                ("twilio_from_number", "+18885550100"),
                ("frontend_url", f"{_PUBLIC_ORIGIN}/"),
            ):
                stack.enter_context(patch.object(settings, name, value))
            handle = None if real_handler else stack.enter_context(patch(
                "app.api.rent_reminders.rent_reminder_webhook_service.handle_event",
                AsyncMock(return_value=True),
            ))
            response = TestClient(app).post(
                path or "/rent-reminders/sms/webhook",
                params=None if path else {"request_id": self._request_id},
                headers=headers,
                **(body if body is not None else {"data": params or self._params}),
            )
        return response, handle

    def test_signed_callback_accepted(self) -> None:
        response, handle = self._post({"X-Twilio-Signature": self._signature()})
        assert response.status_code == 204
        handle.assert_awaited_once_with(self._params, request_id=self._request_id)

    def test_verified_against_the_exact_url_given_to_twilio(self) -> None:
        """Twilio signs the callback URL a text was sent with, byte for byte.
        The ``:`` in the request_id goes out encoded as ``%3A``."""
        with patch.object(settings, "frontend_url", f"{_PUBLIC_ORIGIN}/"):
            callback_url = sms_service.status_callback_url(self._request_id)
        query = urlsplit(callback_url).query
        assert query == f"request_id={self._request_id.replace(':', '%3A')}"

        response, handle = self._post(
            {"X-Twilio-Signature": self._signature(url=callback_url)},
            path=f"/rent-reminders/sms/webhook?{query}",
        )
        assert response.status_code == 204
        handle.assert_awaited_once_with(self._params, request_id=self._request_id)

    def test_a_signature_over_the_internal_url_is_rejected(self) -> None:
        """Behind the proxies a callback arrives on an internal host over http.
        Only the public URL Twilio was given is accepted."""
        internal = f"http://testserver/rent-reminders/sms/webhook?request_id={self._request_id.replace(':', '%3A')}"
        response, handle = self._post({"X-Twilio-Signature": self._signature(url=internal)})
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_the_query_is_checked_as_received(self) -> None:
        """Twilio signed ``%3A``. A query that reaches us spelled any other way
        no longer matches, rather than being re-encoded until it does."""
        response, handle = self._post(
            {"X-Twilio-Signature": self._signature()},
            path=f"/rent-reminders/sms/webhook?request_id={self._request_id}",
        )
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_unsigned_callback_rejected_without_reading_the_body(self) -> None:
        with patch("starlette.requests.Request.form", side_effect=AssertionError("body was read")):
            response, handle = self._post({})
        assert response.status_code == 403
        handle.assert_not_awaited()

    @pytest.mark.parametrize(
        "body",
        [
            {"json": {"MessageSid": "SM" + "1" * 32, "MessageStatus": "delivered"}},
            {"files": {"MessageStatus": (None, "delivered")}},
        ],
        ids=["json", "multipart"],
    )
    def test_a_body_twilio_never_sends_is_rejected_unread(self, body: dict[str, object]) -> None:
        with patch("starlette.requests.Request.form", side_effect=AssertionError("body was read")):
            response, handle = self._post({"X-Twilio-Signature": self._signature()}, body=body)
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_wrong_auth_token_rejected(self) -> None:
        response, handle = self._post({"X-Twilio-Signature": self._signature(token="attacker-token-0123456789")})
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_signature_for_another_try_rejected(self) -> None:
        """The request_id is part of what Twilio signed, so it can't be moved onto another try."""
        other_try = f"{_WEBHOOK_URL}?request_id={self._request_id[:-1]}2"
        response, handle = self._post({"X-Twilio-Signature": self._signature(url=other_try)})
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_tampered_status_rejected(self) -> None:
        signature = self._signature()
        response, handle = self._post(
            {"X-Twilio-Signature": signature}, params={**self._params, "MessageStatus": "failed"},
        )
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_rejected_when_twilio_isnt_configured(self) -> None:
        response, handle = self._post({"X-Twilio-Signature": self._signature()}, configured=False)
        assert response.status_code == 403
        handle.assert_not_awaited()

    def test_a_status_we_dont_act_on_is_still_acknowledged(self) -> None:
        """Twilio logs any answer but a 2xx as an error in its debugger, so an
        ignored status still gets 204."""
        params = {**self._params, "MessageStatus": "queued"}
        with patch(
            "app.services.rent.rent_reminder_webhook_service.unit_of_work",
            side_effect=AssertionError("an ignored status must not touch the database"),
        ):
            response, _ = self._post(
                {"X-Twilio-Signature": self._signature(params=params)}, params=params, real_handler=True,
            )
        assert response.status_code == 204
