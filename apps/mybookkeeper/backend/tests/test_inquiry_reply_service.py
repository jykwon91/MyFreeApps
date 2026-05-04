"""Service-layer tests for inquiry_reply_service.

Verifies the orchestration contract:
- send_reply persists an outbound InquiryMessage with from/to/subject/body
- inquiry stage transitions: new → replied, triaged → replied,
  later stages preserved
- An InquiryEvent('replied','host') is emitted in the same transaction
- Cross-org access raises LookupError
- Missing Gmail integration raises InquiryReplyMissingIntegrationError
- Missing send scope raises InquiryReplyMissingSendScopeError
- Missing inquirer email raises InquiryReplyMissingRecipientError
- Gmail send failure → no message row created, stage unchanged
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendError, GmailSendScopeError
from app.services.inquiries import inquiry_reply_service


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    @asynccontextmanager
    async def _factory():
        yield db

    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(inquiry_reply_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(inquiry_reply_service, "unit_of_work", _uow)
    return None


async def _seed_integration(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    has_send_scope: bool = True,
) -> Integration:
    integration = Integration(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        token_expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
        metadata_={
            "scopes": [
                "https://www.googleapis.com/auth/gmail.readonly",
                *(["https://www.googleapis.com/auth/gmail.send"] if has_send_scope else []),
            ],
        } if has_send_scope else {"scopes": ["https://www.googleapis.com/auth/gmail.readonly"]},
    )
    integration.access_token = "tok"
    integration.refresh_token = "rt"
    db.add(integration)
    await db.flush()
    return integration


async def _seed_inquiry(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    stage: str = "new",
    inquirer_email: str | None = "alice@example.com",
) -> Inquiry:
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Alice",
        inquirer_email=inquirer_email,
    )
    if stage != "new":
        inquiry.stage = stage
        await db.flush()
    return inquiry


@pytest.mark.asyncio
async def test_send_reply_happy_path_inserts_message_event_and_advances_stage(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        return_value="<gmail-id-123>",
    ) as mock_send:
        result = await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="Re: Cozy Room", body="Hi Alice"),
        )

    assert mock_send.called
    assert result.direction == "outbound"
    assert result.channel == "email"
    assert result.subject == "Re: Cozy Room"
    assert result.parsed_body == "Hi Alice"
    assert result.email_message_id == "<gmail-id-123>"

    # Refresh the inquiry — stage advanced.
    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "replied"

    # Event written.
    events = await db.execute(
        select(InquiryEvent).where(
            InquiryEvent.inquiry_id == inquiry.id,
            InquiryEvent.event_type == "replied",
        )
    )
    rows = events.scalars().all()
    assert len(rows) == 1
    assert rows[0].actor == "host"


@pytest.mark.asyncio
async def test_send_reply_from_triaged_advances_to_replied(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, stage="triaged")

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        return_value="<gmail-id>",
    ):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )

    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "replied"


@pytest.mark.asyncio
async def test_send_reply_preserves_later_stage(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """Replying when already in 'video_call_scheduled' must not regress to 'replied'."""
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user, stage="video_call_scheduled",
    )

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        return_value="<gmail-id>",
    ):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )

    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "video_call_scheduled"


@pytest.mark.asyncio
async def test_send_reply_missing_integration_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with pytest.raises(inquiry_reply_service.InquiryReplyMissingIntegrationError):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )


@pytest.mark.asyncio
async def test_send_reply_missing_send_scope_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user, has_send_scope=False)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with pytest.raises(inquiry_reply_service.InquiryReplyMissingSendScopeError):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )


@pytest.mark.asyncio
async def test_send_reply_no_inquirer_email_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user, inquirer_email=None,
    )

    with pytest.raises(inquiry_reply_service.InquiryReplyMissingRecipientError):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )


@pytest.mark.asyncio
async def test_send_reply_cross_org_raises_lookup(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    other_org_id = uuid.uuid4()
    with pytest.raises(LookupError):
        await inquiry_reply_service.send_reply(
            other_org_id, test_user.id, inquiry.id,
            InquiryReplyRequest(subject="s", body="b"),
        )


@pytest.mark.asyncio
async def test_send_reply_gmail_send_failure_no_message_no_stage_change(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """If Gmail rejects, no InquiryMessage is created and the stage stays."""
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        side_effect=GmailSendError("boom"),
    ):
        with pytest.raises(inquiry_reply_service.InquiryReplySendFailedError):
            await inquiry_reply_service.send_reply(
                test_org.id, test_user.id, inquiry.id,
                InquiryReplyRequest(subject="s", body="b"),
            )

    # No outbound message persisted.
    msgs = await db.execute(
        select(InquiryMessage).where(
            InquiryMessage.inquiry_id == inquiry.id,
            InquiryMessage.direction == "outbound",
        )
    )
    assert msgs.scalars().all() == []

    # Stage unchanged.
    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "new"


@pytest.mark.asyncio
async def test_send_reply_scope_revoked_at_send_time_maps_to_scope_error(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """Race: the integration had send scope when we checked, but Google
    revoked it between the check and the send. The route must still surface
    a scope error so the host gets the reconnect prompt."""
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        side_effect=GmailSendScopeError("scope revoked mid-send"),
    ):
        with pytest.raises(inquiry_reply_service.InquiryReplyMissingSendScopeError):
            await inquiry_reply_service.send_reply(
                test_org.id, test_user.id, inquiry.id,
                InquiryReplyRequest(subject="s", body="b"),
            )


@pytest.mark.asyncio
async def test_send_reply_token_expired_sets_needs_reauth_and_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """When send_message raises GmailReauthRequiredError, the service sets
    needs_reauth=True on the Integration and raises InquiryReplyAuthExpiredError.
    No InquiryMessage row is created and the inquiry stage does not change."""
    integration = await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        side_effect=GmailReauthRequiredError("refresh token expired"),
    ):
        with pytest.raises(inquiry_reply_service.InquiryReplyAuthExpiredError):
            await inquiry_reply_service.send_reply(
                test_org.id, test_user.id, inquiry.id,
                InquiryReplyRequest(subject="s", body="b"),
            )

    # The needs_reauth flag must be set on the integration row.
    await db.refresh(integration)
    assert integration.needs_reauth is True
    assert integration.last_reauth_error is not None
    assert integration.last_reauth_failed_at is not None

    # No outbound message persisted.
    msgs = await db.execute(
        select(InquiryMessage).where(
            InquiryMessage.inquiry_id == inquiry.id,
            InquiryMessage.direction == "outbound",
        )
    )
    assert msgs.scalars().all() == []

    # Stage unchanged.
    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "new"


@pytest.mark.asyncio
async def test_send_reply_reply_route_returns_503_on_auth_expired(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """The inquiries reply route maps InquiryReplyAuthExpiredError → HTTP 503
    with detail 'gmail_reauth_required'."""
    from fastapi import HTTPException
    from unittest.mock import AsyncMock

    with patch(
        "app.api.inquiries.inquiry_reply_service.send_reply",
        new=AsyncMock(side_effect=inquiry_reply_service.InquiryReplyAuthExpiredError("token expired")),
    ):
        from app.api.inquiries import send_reply as route_send_reply
        from app.core.context import RequestContext
        from app.models.organization.organization_member import OrgRole
        from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest as RouteRequest

        ctx = RequestContext(
            organization_id=test_org.id,
            user_id=test_user.id,
            org_role=OrgRole.OWNER,
        )
        with pytest.raises(HTTPException) as exc_info:
            await route_send_reply(
                inquiry_id=uuid.uuid4(),
                payload=RouteRequest(subject="s", body="b"),
                ctx=ctx,
            )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "gmail_reauth_required"


@pytest.mark.asyncio
async def test_integration_clear_reauth_state_on_oauth_callback() -> None:
    """handle_gmail_callback clears needs_reauth after a successful re-auth."""
    from contextlib import asynccontextmanager
    from unittest.mock import AsyncMock, MagicMock, patch

    fake_integration = MagicMock(
        needs_reauth=True,
        last_reauth_error="RefreshError: token revoked",
        last_reauth_failed_at=_dt.datetime.now(_dt.timezone.utc),
    )

    @asynccontextmanager
    async def fake_uow():
        yield MagicMock()

    with (
        patch(
            "app.services.integrations.integration_service.unit_of_work", fake_uow,
        ),
        patch(
            "app.services.integrations.integration_service.integration_repo.upsert_gmail",
            new=AsyncMock(return_value=fake_integration),
        ),
        patch(
            "app.services.integrations.integration_service.integration_repo.clear_reauth_state",
            new=AsyncMock(),
        ) as mock_clear,
        patch(
            "app.services.integrations.integration_service.log_auth_event",
            new=AsyncMock(),
        ),
        patch(
            "app.services.integrations.integration_service._verify_oauth_state",
            return_value=(str(uuid.uuid4()), str(uuid.uuid4()), "test-code-verifier"),
        ),
        patch(
            "app.services.integrations.integration_service._get_flow",
        ) as mock_flow_fn,
    ):
        mock_creds = MagicMock()
        mock_creds.token = "new-access-token"
        mock_creds.refresh_token = "new-refresh-token"
        mock_creds.expiry = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1)
        mock_creds.scopes = {"https://www.googleapis.com/auth/gmail.readonly"}

        mock_flow = MagicMock()
        mock_flow.credentials = mock_creds
        mock_flow_fn.return_value = mock_flow

        from app.services.integrations.integration_service import handle_gmail_callback
        await handle_gmail_callback("oauth-code", "state-jwt")

    mock_clear.assert_awaited_once()
