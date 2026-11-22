"""POST /welcome-manuals/{id}/email must not be usable as an email relay.

The send itself is stubbed: these tests are about the gate in front of it, so
they assert how many requests reach the service and what the refusal looks like.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import reject_demo_org_write
from app.core.rate_limit import (
    welcome_manual_email_org_limiter,
    welcome_manual_email_user_limiter,
)
from app.core.welcome_manual_constants import (
    WELCOME_MANUAL_EMAIL_ORG_MAX_PER_DAY,
    WELCOME_MANUAL_EMAIL_USER_MAX_PER_HOUR,
)
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.welcome_manuals.welcome_manual_send_response import WelcomeManualSendResponse
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

MANUAL_ID = uuid.uuid4()


@pytest.fixture(autouse=True)
def _fresh_limiters() -> Iterator[None]:
    welcome_manual_email_user_limiter.reset()
    welcome_manual_email_org_limiter.reset()
    yield
    welcome_manual_email_user_limiter.reset()
    welcome_manual_email_org_limiter.reset()
    app.dependency_overrides.clear()


@pytest.fixture
def send(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    stub = AsyncMock(
        return_value=WelcomeManualSendResponse(
            id=uuid.uuid4(), manual_id=MANUAL_ID, recipient_email="g@example.com",
            status="sent", created_at=datetime.now(timezone.utc),
        ),
    )
    monkeypatch.setattr(
        "app.services.welcome_manuals.welcome_manual_email_service.send_manual_to_guest", stub,
    )
    return stub


def _post_as(org_id: uuid.UUID, user_id: uuid.UUID) -> int:
    ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
    app.dependency_overrides[reject_demo_org_write] = lambda: ctx
    return TestClient(app).post(
        f"/welcome-manuals/{MANUAL_ID}/email", json={"recipient_email": "g@example.com"},
    ).status_code


def _post_body_as(org_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, str]:
    ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
    app.dependency_overrides[reject_demo_org_write] = lambda: ctx
    return TestClient(app).post(
        f"/welcome-manuals/{MANUAL_ID}/email", json={"recipient_email": "g@example.com"},
    ).json()


class TestPerUserLimit:
    def test_sends_under_the_limit_succeed_then_the_next_is_refused(self, send: AsyncMock) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        for _ in range(WELCOME_MANUAL_EMAIL_USER_MAX_PER_HOUR):
            assert _post_as(org_id, user_id) == 200
        assert _post_as(org_id, user_id) == 429
        assert send.await_count == WELCOME_MANUAL_EMAIL_USER_MAX_PER_HOUR

    def test_refusal_has_the_shared_429_body(self, send: AsyncMock) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        for _ in range(WELCOME_MANUAL_EMAIL_USER_MAX_PER_HOUR):
            _post_as(org_id, user_id)
        assert _post_body_as(org_id, user_id) == {"detail": RATE_LIMIT_GENERIC_DETAIL}

    def test_another_user_is_not_held_back(self, send: AsyncMock) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        for _ in range(WELCOME_MANUAL_EMAIL_USER_MAX_PER_HOUR + 1):
            _post_as(org_id, user_id)
        assert _post_as(org_id, uuid.uuid4()) == 200


class TestPerOrgDailyCap:
    def test_the_cap_holds_across_users_of_one_organization(self, send: AsyncMock) -> None:
        org_id = uuid.uuid4()
        sent = 0
        while sent < WELCOME_MANUAL_EMAIL_ORG_MAX_PER_DAY:
            # Fresh user each time, so only the organization's cap can refuse.
            assert _post_as(org_id, uuid.uuid4()) == 200
            sent += 1
        assert _post_as(org_id, uuid.uuid4()) == 429
        assert send.await_count == WELCOME_MANUAL_EMAIL_ORG_MAX_PER_DAY

    def test_another_organization_is_not_held_back(self, send: AsyncMock) -> None:
        org_id = uuid.uuid4()
        for _ in range(WELCOME_MANUAL_EMAIL_ORG_MAX_PER_DAY + 1):
            _post_as(org_id, uuid.uuid4())
        assert _post_as(uuid.uuid4(), uuid.uuid4()) == 200
