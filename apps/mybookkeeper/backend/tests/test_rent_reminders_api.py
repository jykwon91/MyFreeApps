"""Route-level tests for the rent-reminders API.

Services are mocked where the route is only mapping results; the arithmetic and
sending are covered by ``test_rent_reminder_math`` and
``test_rent_reminder_dispatch``. What is checked here is the HTTP contract:
happy-path shapes, validation, refusing text reminders when SMS is not set up,
and that the public webhook rejects anything httpSMS did not sign.
"""
from __future__ import annotations

import datetime as _dt
import time
import uuid
from unittest.mock import AsyncMock, patch

import jwt
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.rent.rent_reminder_overview_response import RentReminderOverviewResponse
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.schemas.rent.rent_reminder_sms_status import RentReminderSmsStatus
from app.services.rent import rent_reminder_dispatch_service
from app.services.system import sms_service

_SIGNING_KEY = "test-signing-key-0123456789abcdefghij"
_WEBHOOK_URL = "https://mybookkeeper.example/api/rent-reminders/sms/webhook"
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
                sms=RentReminderSmsStatus(
                    available=False, encrypted=False, webhook_url=_WEBHOOK_URL,
                ),
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
                AsyncMock(return_value=[sent, sent.model_copy(update={"channel": "sms", "status": "sent_to_phone"})]),
            ) as send_now:
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                )
            assert response.status_code == 200
            assert [(r["channel"], r["status"]) for r in response.json()] == [
                ("email", "sent"), ("sms", "sent_to_phone"),
            ]
            assert "channel" not in send_now.call_args.kwargs
        finally:
            app.dependency_overrides.clear()

    def test_already_sent_is_409(self) -> None:
        _override_auth()
        try:
            with patch(
                "app.api.rent_reminders.rent_reminder_dispatch_service.send_now",
                AsyncMock(side_effect=rent_reminder_dispatch_service.ReminderAlreadySentError("went out")),
            ):
                response = TestClient(app).post(
                    f"/rent-reminders/tenants/{uuid.uuid4()}/send-now",
                )
            assert response.status_code == 409
        finally:
            app.dependency_overrides.clear()


def _token(*, key: str = _SIGNING_KEY, audience: str = _WEBHOOK_URL) -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": "api.httpsms.com", "aud": [audience], "iat": now, "nbf": now - 600, "exp": now + 600},
        key,
        algorithm="HS256",
    )


class TestWebhook:
    _event = {"type": "message.phone.delivered", "data": {"id": "m-1", "request_id": str(uuid.uuid4())}}

    def _post(self, headers: dict[str, str]):
        with patch.object(sms_service, "webhook_signing_key", lambda: _SIGNING_KEY), \
                patch.object(sms_service, "webhook_url", lambda: _WEBHOOK_URL), \
                patch(
                    "app.api.rent_reminders.rent_reminder_webhook_service.handle_event",
                    AsyncMock(return_value=True),
                ) as handle:
            response = TestClient(app).post(
                "/rent-reminders/sms/webhook", json=self._event, headers=headers,
            )
        return response, handle

    def test_signed_event_accepted(self) -> None:
        response, handle = self._post({"Authorization": f"Bearer {_token()}"})
        assert response.status_code == 204
        handle.assert_awaited_once()

    def test_unsigned_event_rejected(self) -> None:
        response, handle = self._post({})
        assert response.status_code == 401
        handle.assert_not_awaited()

    def test_wrong_key_rejected(self) -> None:
        response, handle = self._post({"Authorization": f"Bearer {_token(key="attacker-key-0123456789abcdefghijklmn")}"})
        assert response.status_code == 401
        handle.assert_not_awaited()

    def test_wrong_audience_rejected(self) -> None:
        response, handle = self._post(
            {"Authorization": f"Bearer {_token(audience='https://evil.example/hook')}"},
        )
        assert response.status_code == 401
        handle.assert_not_awaited()
