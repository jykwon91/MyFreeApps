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
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.email_filter_log import EmailFilterLog
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.integrations.integration import Integration
from app.models.listings.listing import Listing
from app.models.properties.property import Property, PropertyType
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import inquiry_message_repo, inquiry_repo
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import app_sent_email_service
from app.services.email.constants import APP_SENT_INQUIRY_REPLY_FILTER_REASON
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendError, GmailSendScopeError
from app.services.inquiries import inquiry_reply_service, reply_claim_settlement, reply_recording


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
    monkeypatch.setattr(reply_recording, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(reply_recording, "unit_of_work", _uow)
    monkeypatch.setattr(reply_claim_settlement, "unit_of_work", _uow)
    # The app-sent recorder opens its own transaction — route it to the same
    # test session so its EmailFilterLog write is visible to assertions.
    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)
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
        gmail_address="host@gmail.com",
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
    listing_id: uuid.UUID | None = None,
) -> Inquiry:
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Alice",
        inquirer_email=inquirer_email,
        listing_id=listing_id,
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

    # From is the connected Gmail account, not the app login email.
    assert mock_send.await_args.kwargs["from_address"] == "host@gmail.com"
    assert test_user.email != "host@gmail.com"
    assert result.from_address == "host@gmail.com"
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

    # Sent message recorded so the Gmail sync never re-ingests the host's
    # own reply as a financial document.
    filter_rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(filter_rows) == 1
    assert filter_rows[0].message_id == "<gmail-id-123>"
    assert filter_rows[0].reason == APP_SENT_INQUIRY_REPLY_FILTER_REASON
    assert filter_rows[0].from_address == "host@gmail.com"
    assert filter_rows[0].subject == "Re: Cozy Room"


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

    # Nothing was sent, so nothing was recorded as app-sent.
    filter_rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert filter_rows == []


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
    """When send_message raises GmailReauthRequiredError (which it does AFTER
    setting needs_reauth=True on the Integration), InquiryReplyAuthExpiredError
    is surfaced and no InquiryMessage row is created.

    The mock simulates the real send_message contract: it writes needs_reauth
    to the DB row before raising, so callers observe the committed state.
    """
    import datetime as _dt_inner

    integration = await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    async def _fake_send_raises_after_setting_flag(*args, **kwargs):
        # Mirror what the real send_message now does: set needs_reauth first,
        # then raise GmailReauthRequiredError.
        integration.needs_reauth = True
        integration.last_reauth_error = "refresh token expired"
        integration.last_reauth_failed_at = _dt_inner.datetime.now(_dt_inner.timezone.utc)
        await db.flush()
        raise GmailReauthRequiredError("refresh token expired")

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        side_effect=_fake_send_raises_after_setting_flag,
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


DISCLOSURE = "I have a 90lb golden retriever on the premises."


async def _seed_listing(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    pets_on_premises: bool = True,
    large_dog_disclosure: str | None = DISCLOSURE,
) -> Listing:
    prop = Property(id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Oak", type=PropertyType.LONG_TERM)
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        title="Cozy Room",
        monthly_rate=Decimal("1500"),
        room_type="private_room",
        status="active",
        pets_on_premises=pets_on_premises,
        large_dog_disclosure=large_dog_disclosure,
    )
    db.add(listing)
    await db.flush()
    return listing


async def _send(org: Organization, user: User, inquiry: Inquiry, body: str):
    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        return_value=f"<gmail-{uuid.uuid4()}>",
    ) as mock_send:
        result = await inquiry_reply_service.send_reply(
            org.id, user.id, inquiry.id, InquiryReplyRequest(subject="Re: Cozy Room", body=body),
        )
    return result, mock_send.call_args.kwargs["body"]


@pytest.mark.asyncio
async def test_custom_reply_gets_the_disclosure_in_the_email_and_the_record(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)

    result, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == f"{DISCLOSURE}\n\nHi Alice"
    assert result.parsed_body == sent_body


@pytest.mark.asyncio
async def test_reply_that_already_says_it_is_not_doubled_even_with_changed_line_breaks(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)
    rewrapped = DISCLOSURE.replace("golden retriever", "golden\r\nretriever")

    _, sent_body = await _send(test_org, test_user, inquiry, f"{rewrapped}\n\nHi Alice")

    assert sent_body == f"{rewrapped}\n\nHi Alice"


@pytest.mark.asyncio
async def test_inquirer_is_told_once_across_a_conversation(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)

    await _send(test_org, test_user, inquiry, "First")
    _, second_body = await _send(test_org, test_user, inquiry, "Second")

    assert second_body == "Second"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("pets_on_premises", "disclosure"),
    [(False, DISCLOSURE), (True, None), (True, "   ")],
)
async def test_no_disclosure_to_add(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
    pets_on_premises: bool, disclosure: str | None,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(
        db, org=test_org, user=test_user, pets_on_premises=pets_on_premises, large_dog_disclosure=disclosure,
    )
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)

    _, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == "Hi Alice"


@pytest.mark.asyncio
async def test_inquiry_without_a_listing_sends_as_written(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)

    _, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == "Hi Alice"


async def _add_message(db: AsyncSession, inquiry: Inquiry, *, direction: str, body: str | None) -> None:
    await inquiry_message_repo.create(
        db,
        inquiry_id=inquiry.id,
        direction=direction,
        channel="email",
        from_address="a@example.com",
        to_address="b@example.com",
        subject="Re: Cozy Room",
        parsed_body=body,
    )
    await db.flush()


@pytest.mark.asyncio
async def test_inquirer_quoting_the_disclosure_doesnt_count_as_being_told(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)
    await _add_message(db, inquiry, direction="inbound", body=f"Saw this: {DISCLOSURE}")

    _, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == f"{DISCLOSURE}\n\nHi Alice"


@pytest.mark.asyncio
async def test_earlier_reply_counts_whatever_its_line_breaks_and_empty_ones_dont_break_it(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)
    await _add_message(db, inquiry, direction="outbound", body=None)
    await _add_message(db, inquiry, direction="outbound", body=DISCLOSURE.replace(" ", "\r\n"))

    _, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == "Hi Alice"


@pytest.mark.asyncio
async def test_retry_after_gmail_rejects_still_carries_the_disclosure_once(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)

    with patch(
        "app.services.inquiries.inquiry_reply_service.gmail_service.send_message",
        side_effect=GmailSendError("nope"),
    ), pytest.raises(inquiry_reply_service.InquiryReplySendFailedError):
        await inquiry_reply_service.send_reply(
            test_org.id, test_user.id, inquiry.id, InquiryReplyRequest(subject="Re: Cozy Room", body="Hi"),
        )

    _, sent_body = await _send(test_org, test_user, inquiry, "Hi")

    assert sent_body == f"{DISCLOSURE}\n\nHi"


@pytest.mark.asyncio
async def test_listing_thats_gone_still_sends_and_says_why_nothing_was_added(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session, caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_integration(db, org=test_org, user=test_user)
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user, listing_id=listing.id)

    with patch(
        "app.services.inquiries.inquiry_reply_service.listing_repo.get_by_id", return_value=None,
    ):
        _, sent_body = await _send(test_org, test_user, inquiry, "Hi Alice")

    assert sent_body == "Hi Alice"
    assert "no pet disclosure" in caplog.text
