"""The operator's new-inquiry email shows the stay the inquirer asked for."""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.services.system import inquiry_notification_email


async def _send_for(db: AsyncSession, inquiry: Inquiry) -> str:
    db.add(inquiry)
    await db.flush()

    @asynccontextmanager
    async def _same_session():
        yield db

    sent: list[str] = []
    with (
        patch.object(inquiry_notification_email, "AsyncSessionLocal", _same_session),
        patch.object(inquiry_notification_email.settings, "cost_alert_recipients", "host@example.com"),
        patch.object(
            inquiry_notification_email.email_service, "send_email",
            side_effect=lambda to, subject, body: sent.append(body) or True,
        ),
    ):
        assert await inquiry_notification_email.send_inquiry_notification(inquiry_id=inquiry.id)
    return sent[0]


def _inquiry(user: User, org: Organization, **dates: _dt.date | None) -> Inquiry:
    return Inquiry(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        source="public_form", submitted_via="public_form",
        received_at=_dt.datetime.now(_dt.timezone.utc), inquirer_name="Dana", **dates,
    )


@pytest.mark.asyncio
async def test_shows_the_requested_dates(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    body = await _send_for(db, _inquiry(
        test_user, test_org,
        desired_start_date=_dt.date(2027, 1, 1), desired_end_date=_dt.date(2027, 3, 1),
    ))
    assert "2027-01-01" in body
    assert "2027-03-01" in body
    assert "<strong>Duration:</strong> 59 days" in body


@pytest.mark.asyncio
async def test_says_when_no_dates_were_given(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    body = await _send_for(db, _inquiry(test_user, test_org))
    assert body.count("(not set)") == 2
