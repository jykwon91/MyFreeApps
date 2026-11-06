"""An inquiry reply sent with a ``client_request_id`` is emailed at most once.

Each test walks one row of the dedup matrix: double taps, a replay after the
reply went out, Gmail refusing, Gmail answering ambiguously, the database
failing after the email went out, and a crashed attempt left mid-send.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.email_filter_log import EmailFilterLog
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import (
    inquiry_message_repo,
    inquiry_reply_send_repo,
)
from app.repositories.inquiries.reply_already_claimed_error import (
    ReplyAlreadyClaimedError,
)
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import gmail_service
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
)
from app.services.inquiries.reply_exceptions import (
    InquiryReplyAuthExpiredError,
    InquiryReplyInProgressError,
    InquiryReplyRequestIdReusedError,
    InquiryReplySendFailedError,
    InquiryReplySentNotRecordedError,
    InquiryReplyUnconfirmedError,
)
from app.services.inquiries.reply_request_hash import reply_request_hash
from tests.reply_seed import (
    age_reply_claims,
    reply_claims,
    reply_request,
    seed_inquiry,
    send_reply,
)


async def _count(db: AsyncSession, model: type) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


pytestmark = pytest.mark.usefixtures("reply_sessions")


@pytest.fixture
def ids(test_org: Organization, test_user: User) -> tuple[Organization, User]:
    return test_org, test_user


@pytest.mark.asyncio
async def test_sent_claim_points_at_its_message_and_the_header_gmail_got(
    db: AsyncSession, ids, reply_gmail_send,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)

    result = await send_reply(org, user, inquiry, reply_request(uuid.uuid4()))

    [claim] = await reply_claims(db)
    assert claim.status == "sent"
    assert claim.inquiry_message_id == result.id
    assert reply_gmail_send.await_args.kwargs["message_id_header"] == claim.send_message_id


@pytest.mark.asyncio
async def test_replay_after_sending_returns_the_same_message_even_with_gmail_gone(
    db: AsyncSession, ids, reply_gmail_send,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    first = await send_reply(org, user, inquiry, request)

    await db.execute(update(Integration).values(metadata_={"scopes": []}))
    await db.commit()
    again = await send_reply(org, user, inquiry, request)

    assert again.id == first.id
    assert reply_gmail_send.await_count == 1
    assert await _count(db, InquiryMessage) == 1


@pytest.mark.asyncio
async def test_double_tap_emails_once(db: AsyncSession, ids, monkeypatch) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    release = asyncio.Event()
    in_gmail = asyncio.Event()

    async def _slow_send(*args: object, **kwargs: object) -> str:
        in_gmail.set()
        await release.wait()
        return "gmail-sent-1"

    send = AsyncMock(side_effect=_slow_send)
    monkeypatch.setattr(gmail_service, "send_message", send)

    first = asyncio.create_task(send_reply(org, user, inquiry, request))
    await in_gmail.wait()
    with pytest.raises(InquiryReplyInProgressError):
        await send_reply(org, user, inquiry, request)
    release.set()
    await first

    assert send.await_count == 1
    assert await _count(db, InquiryMessage) == 1


@pytest.mark.asyncio
async def test_two_claims_on_one_key_only_one_wins(db: AsyncSession, ids) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    key = uuid.uuid4()
    now = _dt.datetime.now(_dt.timezone.utc)

    await inquiry_reply_send_repo.claim(
        db, inquiry_id=inquiry.id, client_request_id=key,
        request_hash="h", send_message_id="<a@x>", sender_gmail_address="host@gmail.com", claimed_at=now,
    )
    await db.commit()
    with pytest.raises(ReplyAlreadyClaimedError):
        await inquiry_reply_send_repo.claim(
            db, inquiry_id=inquiry.id, client_request_id=key,
            request_hash="h", send_message_id="<b@x>", sender_gmail_address="host@gmail.com", claimed_at=now,
        )


@pytest.mark.asyncio
async def test_same_key_on_another_inquiry_is_its_own_reply(db: AsyncSession, ids, reply_gmail_send) -> None:
    org, user = ids
    first = await seed_inquiry(db, org, user)
    second = await seed_inquiry(db, org, user, with_gmail=False)
    key = uuid.uuid4()

    await send_reply(org, user, first, reply_request(key))
    await send_reply(org, user, second, reply_request(key))

    assert reply_gmail_send.await_count == 2
    assert len(await reply_claims(db)) == 2


@pytest.mark.asyncio
async def test_key_reused_for_a_different_reply_is_refused(db: AsyncSession, ids, reply_gmail_send) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    key = uuid.uuid4()
    await send_reply(org, user, inquiry, reply_request(key))

    with pytest.raises(InquiryReplyRequestIdReusedError):
        await send_reply(org, user, inquiry, reply_request(key, body="Something else"))
    assert reply_gmail_send.await_count == 1


def test_request_hash_covers_template_subject_and_body() -> None:
    base = InquiryReplyRequest(subject="s", body="b")
    assert reply_request_hash(base) == reply_request_hash(InquiryReplyRequest(subject="s", body="b"))
    assert reply_request_hash(base) != reply_request_hash(InquiryReplyRequest(subject="s2", body="b"))
    assert reply_request_hash(base) != reply_request_hash(InquiryReplyRequest(subject="s", body="b2"))
    assert reply_request_hash(base) != reply_request_hash(
        InquiryReplyRequest(subject="s", body="b", template_id=uuid.uuid4()),
    )
    # The key itself isn't part of what was written.
    assert reply_request_hash(base) == reply_request_hash(
        InquiryReplyRequest(subject="s", body="b", client_request_id=uuid.uuid4()),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("gmail_error", "raised"),
    [
        (GmailSendError("400"), InquiryReplySendFailedError),
        (GmailReauthRequiredError("expired"), InquiryReplyAuthExpiredError),
    ],
)
async def test_definite_refusal_releases_so_the_same_key_can_retry(
    db: AsyncSession, ids, reply_gmail_send, gmail_error, raised,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = [gmail_error, "gmail-sent-2"]

    with pytest.raises(raised):
        await send_reply(org, user, inquiry, request)
    assert await reply_claims(db) == []
    assert await _count(db, InquiryMessage) == 0

    await send_reply(org, user, inquiry, request)
    assert reply_gmail_send.await_count == 2
    [claim] = await reply_claims(db)
    assert claim.status == "sent"


@pytest.mark.asyncio
async def test_unknown_outcome_holds_the_claim(db: AsyncSession, ids, reply_gmail_send) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = GmailSendOutcomeUnknownError("timeout")

    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    [claim] = await reply_claims(db)
    assert claim.status == "sending"

    with pytest.raises(InquiryReplyInProgressError):
        await send_reply(org, user, inquiry, request)
    assert reply_gmail_send.await_count == 1


@pytest.mark.asyncio
async def test_stale_claim_found_in_gmail_is_recorded_without_emailing_again(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    await age_reply_claims(db)
    reply_gmail_find.return_value = "gmail-sent-1"

    result = await send_reply(org, user, inquiry, request)

    [claim] = await reply_claims(db)
    assert reply_gmail_find.await_args.args[1] == claim.send_message_id
    assert claim.status == "sent" and claim.inquiry_message_id == result.id
    assert result.email_message_id == "gmail-sent-1"
    assert result.from_address == "host@gmail.com"
    assert reply_gmail_send.await_count == 1
    await db.refresh(inquiry)
    assert inquiry.stage == "replied"


@pytest.mark.asyncio
async def test_stale_claim_not_in_gmail_is_released_and_sent_once(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = [GmailSendOutcomeUnknownError("reset"), "gmail-sent-2"]
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    [abandoned] = await reply_claims(db)
    await age_reply_claims(db)

    await send_reply(org, user, inquiry, request)

    assert reply_gmail_find.await_count == 1
    assert reply_gmail_send.await_count == 2
    [claim] = await reply_claims(db)
    assert claim.status == "sent"
    assert claim.send_message_id != abandoned.send_message_id
    assert await _count(db, InquiryMessage) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("lookup_error", "raised"),
    [
        (ConnectionError("gmail unreachable"), InquiryReplyUnconfirmedError),
        (GmailReauthRequiredError("expired"), InquiryReplyAuthExpiredError),
    ],
)
async def test_stale_claim_lookup_failure_changes_nothing(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find, lookup_error, raised,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    await age_reply_claims(db)
    [before] = await reply_claims(db)
    reply_gmail_find.side_effect = lookup_error

    with pytest.raises(raised):
        await send_reply(org, user, inquiry, request)

    [after] = await reply_claims(db)
    assert after.status == "sending"
    assert after.send_message_id == before.send_message_id
    assert reply_gmail_send.await_count == 1


async def _stale_claim_found_in_gmail(
    db: AsyncSession, org: Organization, user: User, reply_gmail_send: AsyncMock, reply_gmail_find: AsyncMock,
) -> tuple[Inquiry, InquiryReplyRequest]:
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    await age_reply_claims(db)
    reply_gmail_find.return_value = "gmail-sent-1"
    return inquiry, request


@pytest.mark.asyncio
async def test_losing_a_settle_race_returns_the_winners_reply(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find, monkeypatch,
) -> None:
    org, user = ids
    inquiry, request = await _stale_claim_found_in_gmail(db, org, user, reply_gmail_send, reply_gmail_find)
    [claim] = await reply_claims(db)
    winner = await inquiry_message_repo.create(
        db, inquiry_id=inquiry.id, direction="outbound", channel="email", email_message_id="gmail-sent-1",
    )
    await db.commit()
    # The other attempt marks the claim sent between our lookup and our write.
    settled = InquiryReplySend(
        id=claim.id, inquiry_id=inquiry.id, client_request_id=claim.client_request_id,
        request_hash=claim.request_hash, status="sent", send_message_id=claim.send_message_id,
        claimed_at=claim.claimed_at, inquiry_message_id=winner.id,
    )
    monkeypatch.setattr(inquiry_reply_send_repo, "mark_sent", AsyncMock(return_value=False))
    monkeypatch.setattr(inquiry_reply_send_repo, "get_by_id", AsyncMock(return_value=settled))

    result = await send_reply(org, user, inquiry, request)

    assert result.id == winner.id
    assert await _count(db, InquiryMessage) == 1
    assert reply_gmail_send.await_count == 1


@pytest.mark.asyncio
async def test_losing_a_settle_race_to_an_unsent_claim_is_in_progress(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find, monkeypatch,
) -> None:
    org, user = ids
    inquiry, request = await _stale_claim_found_in_gmail(db, org, user, reply_gmail_send, reply_gmail_find)
    monkeypatch.setattr(inquiry_reply_send_repo, "mark_sent", AsyncMock(return_value=False))

    with pytest.raises(InquiryReplyInProgressError):
        await send_reply(org, user, inquiry, request)
    assert await _count(db, InquiryMessage) == 0


@pytest.mark.asyncio
async def test_stale_claim_another_attempt_released_first_is_in_progress(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find, monkeypatch,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    reply_gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, request)
    await age_reply_claims(db)
    monkeypatch.setattr(inquiry_reply_send_repo, "release", AsyncMock(return_value=False))

    with pytest.raises(InquiryReplyInProgressError):
        await send_reply(org, user, inquiry, request)
    assert reply_gmail_send.await_count == 1


@pytest.mark.asyncio
async def test_saving_fails_after_send_never_emails_again(
    db: AsyncSession, ids, reply_gmail_send, reply_gmail_find, monkeypatch,
) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    request = reply_request(uuid.uuid4())
    real_mark = inquiry_reply_send_repo.mark_sent
    monkeypatch.setattr(
        inquiry_reply_send_repo, "mark_sent", AsyncMock(side_effect=ConnectionError("db went away")),
    )

    with pytest.raises(InquiryReplySentNotRecordedError):
        await send_reply(org, user, inquiry, request)
    assert await _count(db, EmailFilterLog) == 1
    assert await _count(db, InquiryMessage) == 0
    with pytest.raises(InquiryReplyInProgressError):
        await send_reply(org, user, inquiry, request)

    monkeypatch.setattr(inquiry_reply_send_repo, "mark_sent", real_mark)
    await age_reply_claims(db)
    reply_gmail_find.return_value = "gmail-sent-1"
    await send_reply(org, user, inquiry, request)

    assert reply_gmail_send.await_count == 1
    assert await _count(db, InquiryMessage) == 1
    [claim] = await reply_claims(db)
    assert claim.status == "sent"


@pytest.mark.asyncio
async def test_release_or_mark_with_an_old_message_id_changes_nothing(db: AsyncSession, ids) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)
    claim = await inquiry_reply_send_repo.claim(
        db, inquiry_id=inquiry.id, client_request_id=uuid.uuid4(),
        request_hash="h", send_message_id="<new@x>", sender_gmail_address="host@gmail.com",
        claimed_at=_dt.datetime.now(_dt.timezone.utc),
    )
    await db.commit()

    assert await inquiry_reply_send_repo.release(db, claim_id=claim.id, send_message_id="<old@x>") is False
    assert await inquiry_reply_send_repo.mark_sent(
        db, claim_id=claim.id, send_message_id="<old@x>", inquiry_message_id=uuid.uuid4(),
    ) is False
    await db.commit()
    [still] = await reply_claims(db)
    assert still.status == "sending"


@pytest.mark.asyncio
async def test_without_a_key_nothing_is_claimed(db: AsyncSession, ids, reply_gmail_send) -> None:
    org, user = ids
    inquiry = await seed_inquiry(db, org, user)

    await send_reply(org, user, inquiry, reply_request(None))
    await send_reply(org, user, inquiry, reply_request(None))

    assert reply_gmail_send.await_count == 2
    assert await reply_claims(db) == []
    assert reply_gmail_send.await_args_list[0].kwargs["message_id_header"] != (
        reply_gmail_send.await_args_list[1].kwargs["message_id_header"]
    )


def test_claims_go_with_their_inquiry_and_message() -> None:
    """Checked on the model: the test database runs SQLite with foreign keys off."""
    fks = {fk.parent.name: fk for fk in InquiryReplySend.__table__.foreign_keys}
    assert fks["inquiry_id"].column.table.name == "inquiries"
    assert fks["inquiry_id"].ondelete == "CASCADE"
    assert fks["inquiry_message_id"].column.table.name == "inquiry_messages"
    assert fks["inquiry_message_id"].ondelete == "CASCADE"
