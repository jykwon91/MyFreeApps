"""Passing tenants' replies to rent reminder texts on to their landlord.

Runs against the in-memory database with ``unit_of_work`` patched to yield the
test session (the pattern in ``test_rent_reminder_dispatch``), and the email
mocked at the ``app.services.system`` seam. The email goes out in the
background, so every reply is followed by ``drain_tracked`` before the test
looks at what was sent. Seeded texts and replies both go through
``phone_lookup_hash``, so no test depends on the key the settings carry.

Most tests call the service directly; ``TestThroughTheWebhook`` takes one
reply the whole way, from Twilio's signed POST to the landlord's email.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from platform_shared.core.sms_constants import TWILIO_EMPTY_TWIML
from platform_shared.core.tracked_task import drain_tracked
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.request_validator import RequestValidator

from app.api import rent_reminders as routes
from app.core.config import settings
from app.core.rent_reminder_constants import (
    ERROR_SMS_NETWORK,
    ERROR_SMS_OPTED_OUT,
    ERROR_SMS_OUTCOME_UNKNOWN,
    REPLY_FORWARD_LIMIT,
    REPLY_MATCH_WINDOW_DAYS,
)
from app.core.security import phone_lookup_hash
from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.main import app
from app.models.user.user import User
from app.services.rent import rent_reminder_reply_service as reply
from app.services.system import email_service

UTC = _dt.timezone.utc
NOW = _dt.datetime(2026, 11, 20, 18, 0, tzinfo=UTC)
TENANT_PHONE = "+17135550100"
OUR_NUMBER = "+18885550100"
ACCOUNT_SID = "AC" + "f" * 32
MESSAGE_SID = "SM" + "a" * 32
PUBLIC_ORIGIN = "https://mybookkeeper.example"
INBOUND_URL = f"{PUBLIC_ORIGIN}/api/rent-reminders/sms/inbound"
AUTH_TOKEN = "test-twilio-auth-token-0123456789"
DUE = _dt.date(2026, 11, 22)


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


@pytest.fixture()
def wired(db: AsyncSession):
    """Route the service's transaction into the test session, set Twilio up and
    mock the email. Yields the ``send_email`` mock."""
    send_email = AsyncMock(return_value=True)
    with ExitStack() as stack:
        stack.enter_context(patch.object(reply, "unit_of_work", _fake_uow(db)))
        for name, value in (
            ("sms_backend", "twilio"),
            ("twilio_account_sid", ACCOUNT_SID),
            ("twilio_auth_token", AUTH_TOKEN),
            ("twilio_from_number", OUR_NUMBER),
            ("frontend_url", f"{PUBLIC_ORIGIN}/"),
            ("app_url", ""),
        ):
            stack.enter_context(patch.object(settings, name, value))
        stack.enter_context(patch.object(email_service, "send_email", send_email))
        reply._forward_limiter.reset()
        stack.callback(reply._forward_limiter.reset)
        yield send_email


@pytest.fixture()
def fresh_inbound_limit():
    """The webhook's per-IP limit starts and ends unspent."""
    routes._inbound_limiter.reset()
    yield
    routes._inbound_limiter.reset()


@pytest.fixture()
def no_database(wired):
    """On top of ``wired``: fail the test if the service opens a transaction."""
    with patch.object(reply, "unit_of_work", side_effect=AssertionError("must not touch the database")):
        yield


async def _landlord(db: AsyncSession, *, email: str = "jason@example.com") -> OrganizationMember:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    org = Organization(id=uuid.uuid4(), name=f"{email}'s Workspace", created_by=user.id)
    db.add(org)
    await db.flush()
    member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner")
    db.add(member)
    await db.flush()
    return member


async def _tenant(
    db: AsyncSession, landlord: OrganizationMember, *, name: str | None = "Sonu Patel",
) -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=landlord.organization_id,
        user_id=landlord.user_id,
        stage="lease_signed",
        legal_name=name,
        contact_phone="(713) 555-0100",
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def _text(
    db: AsyncSession,
    landlord: OrganizationMember,
    tenant: Applicant,
    *,
    hours_ago: float = 1,
    status: str = "delivered",
    error_code: str | None = None,
    due: _dt.date = DUE,
    phone: str = TENANT_PHONE,
) -> RentReminderSend:
    """A reminder text to ``phone``, claimed ``hours_ago`` before ``NOW``."""
    send = RentReminderSend(
        id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        applicant_id=tenant.id,
        organization_id=landlord.organization_id,
        user_id=landlord.user_id,
        due_date=due,
        channel="sms",
        status=status,
        error_code=error_code,
        amount=Decimal("1500.00"),
        message_body="Hi Sonu, reminder: rent of $1,500 is due on Sunday, Nov 22.",
        recipient_phone_hash=phone_lookup_hash(phone),
        created_at=NOW - _dt.timedelta(hours=hours_ago),
    )
    db.add(send)
    await db.flush()
    return send


async def _rents(db: AsyncSession, landlord: OrganizationMember, tenant: Applicant, address: str) -> None:
    """Give ``tenant`` a rent schedule for a property at ``address``."""
    prop = Property(
        id=uuid.uuid4(),
        organization_id=landlord.organization_id,
        user_id=landlord.user_id,
        name=f"House on {address}",
        address=address,
    )
    db.add(prop)
    await db.flush()
    db.add(RentSchedule(
        id=uuid.uuid4(),
        organization_id=landlord.organization_id,
        user_id=landlord.user_id,
        applicant_id=tenant.id,
        property_id=prop.id,
        amount=Decimal("1500.00"),
        cadence="monthly",
        start_date=_dt.date(2026, 1, 1),
    ))
    await db.flush()


def _inbound(body: str = "Paid, thanks!", **overrides: str) -> dict[str, str]:
    """The form Twilio posts for a text to our number."""
    params = {
        "MessageSid": MESSAGE_SID,
        "AccountSid": ACCOUNT_SID,
        "From": TENANT_PHONE,
        "To": OUR_NUMBER,
        "Body": body,
        "NumMedia": "0",
    }
    params.update(overrides)
    return params


async def _reply(body: str = "Paid, thanks!", **overrides: str) -> str:
    outcome = await reply.handle_message(_inbound(body, **overrides), now=NOW)
    await drain_tracked()
    return outcome


def _app_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    """Records from our own code, not the database driver's."""
    return [record for record in caplog.records if record.name.startswith(("app.", "platform_shared."))]


def _sent(send_email: AsyncMock) -> tuple[list[str], str, str]:
    """The one email sent: its recipients, subject and HTML."""
    send_email.assert_awaited_once()
    to, subject, html = send_email.await_args.args
    return to, subject, html


class TestForwarded:
    async def test_the_landlord_who_texted_gets_the_reply(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _text(db, landlord, sonu)

        assert await _reply("Paid via Zelle.\nThe sink is leaking again.") == "forwarded"

        to, subject, html = _sent(wired)
        assert to == ["jason@example.com"]
        assert subject == "Sonu replied to your rent text"
        assert "<p>Sonu Patel replied to your text about rent due Nov 22:</p>" in html
        assert ">Paid via Zelle.<br>The sink is leaking again.</blockquote>" in html
        assert f'href="{PUBLIC_ORIGIN}/tenants/{sonu.id}"' in html

    async def test_the_email_shows_only_the_last_digits_of_the_number(
        self, db: AsyncSession, wired,
    ) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply() == "forwarded"

        _, _, html = _sent(wired)
        assert "Their number ends in 0100" in html
        for fragment in (TENANT_PHONE, "7135550100", "555-0100", "555 0100", "(713)"):
            assert fragment not in html

    async def test_a_tenants_markup_reaches_the_landlord_as_text(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply('<a href="https://evil.example">Pay here</a> & <script>x()</script>') == "forwarded"

        _, _, html = _sent(wired)
        assert "<script>" not in html
        assert 'href="https://evil.example"' not in html
        assert (
            "&lt;a href=&quot;https://evil.example&quot;&gt;Pay here&lt;/a&gt; &amp; "
            "&lt;script&gt;x()&lt;/script&gt;"
        ) in html

    async def test_names_the_property_the_tenant_rents(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _rents(db, landlord, sonu, "1 Maple St")
        await _text(db, landlord, sonu)

        assert await _reply() == "forwarded"
        assert "rent due Nov 22 for 1 Maple St:" in _sent(wired)[2]

    async def test_no_property_when_the_tenant_rents_more_than_one(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _rents(db, landlord, sonu, "1 Maple St")
        await _rents(db, landlord, sonu, "9 Elm St")
        await _text(db, landlord, sonu)

        assert await _reply() == "forwarded"
        assert "rent due Nov 22:" in _sent(wired)[2]

    async def test_the_link_uses_the_app_url_when_one_is_set(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _text(db, landlord, sonu)

        with patch.object(settings, "app_url", "https://app.mybookkeeper.example/"):
            assert await _reply() == "forwarded"
        assert f'href="https://app.mybookkeeper.example/tenants/{sonu.id}"' in _sent(wired)[2]

    async def test_an_unnamed_tenant_is_called_a_tenant(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord, name=None))

        assert await _reply() == "forwarded"
        assert _sent(wired)[1] == "A tenant replied to your rent text"


class TestTwoAccountsTextingTheSameNumber:
    async def test_the_newest_text_wins_when_they_texted_days_apart(self, db: AsyncSession, wired) -> None:
        jason = await _landlord(db, email="jason@example.com")
        maria = await _landlord(db, email="maria@example.com")
        await _text(db, jason, await _tenant(db, jason), hours_ago=24 * 9, due=_dt.date(2026, 11, 12))
        new_tenant = await _tenant(db, maria, name="Ravi Shah")
        await _text(db, maria, new_tenant, hours_ago=3)

        assert await _reply() == "forwarded"

        to, subject, html = _sent(wired)
        assert to == ["maria@example.com"]
        assert subject == "Ravi replied to your rent text"
        assert "rent due Nov 22:" in html
        assert "Sonu" not in html

    async def test_nobody_gets_it_when_they_texted_too_close_together(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        jason = await _landlord(db, email="jason@example.com")
        maria = await _landlord(db, email="maria@example.com")
        await _text(db, jason, await _tenant(db, jason), hours_ago=5)
        await _text(db, maria, await _tenant(db, maria, name="Ravi Shah"), hours_ago=1)

        with caplog.at_level(logging.INFO, logger=reply.__name__):
            assert await _reply() == "ambiguous"

        wired.assert_not_awaited()
        assert f"more than one account texted that number recently: sid={MESSAGE_SID}" in caplog.text

    async def test_a_text_twilio_blocked_loses_to_one_that_reached_the_number(
        self, db: AsyncSession, wired,
    ) -> None:
        """Maria's tenant texted STOP, which blocks Jason's texts to the number
        too. Jason's text never reached them, so their START is Maria's."""
        jason = await _landlord(db, email="jason@example.com")
        maria = await _landlord(db, email="maria@example.com")
        await _text(db, maria, await _tenant(db, maria, name="Ravi Shah"), hours_ago=24 * 4)
        await _text(
            db, jason, await _tenant(db, jason), hours_ago=1, status="failed", error_code=ERROR_SMS_OPTED_OUT,
        )

        assert await _reply("START") == "forwarded"

        to, subject, _ = _sent(wired)
        assert to == ["maria@example.com"]
        assert subject == "Ravi can get your rent texts again"

    async def test_a_text_to_another_number_doesnt_count(self, db: AsyncSession, wired) -> None:
        jason = await _landlord(db, email="jason@example.com")
        maria = await _landlord(db, email="maria@example.com")
        await _text(db, jason, await _tenant(db, jason), hours_ago=2)
        await _text(db, maria, await _tenant(db, maria), hours_ago=1, phone="+17135550199")

        assert await _reply() == "forwarded"
        assert _sent(wired)[0] == ["jason@example.com"]


class TestTenantsSharingANumber:
    async def test_the_newest_texts_tenant_is_named_and_the_others_listed(
        self, db: AsyncSession, wired,
    ) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord, name="Sonu Patel")
        ravi = await _tenant(db, landlord, name="Ravi Patel")
        await _text(db, landlord, ravi, hours_ago=200, due=_dt.date(2026, 11, 15))
        await _text(db, landlord, sonu, hours_ago=2)

        assert await _reply() == "forwarded"

        _, subject, html = _sent(wired)
        assert subject == "Sonu replied to your rent text"
        assert "rent due Nov 22:" in html
        assert "<p>This number is also on file for Ravi Patel.</p>" in html
        assert f"/tenants/{sonu.id}" in html

    async def test_a_deleted_tenant_is_left_out_and_the_next_one_named_with_their_own_due_date(
        self, db: AsyncSession, wired,
    ) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord, name="Sonu Patel")
        ravi = await _tenant(db, landlord, name="Ravi Patel")
        await _text(db, landlord, ravi, hours_ago=200, due=_dt.date(2026, 11, 15))
        await _text(db, landlord, sonu, hours_ago=2)
        sonu.deleted_at = NOW - _dt.timedelta(hours=1)
        await db.flush()

        assert await _reply() == "forwarded"

        _, subject, html = _sent(wired)
        assert subject == "Ravi replied to your rent text"
        assert "rent due Nov 15:" in html
        assert "Sonu" not in html
        assert "also on file" not in html


class TestNotForwarded:
    async def test_a_number_we_never_texted(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply(From="+17135550199") == "unmatched"
        wired.assert_not_awaited()

    async def test_a_text_older_than_the_match_window(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord), hours_ago=24 * REPLY_MATCH_WINDOW_DAYS + 1)

        assert await _reply() == "unmatched"
        wired.assert_not_awaited()

    async def test_a_text_just_inside_the_match_window(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord), hours_ago=24 * REPLY_MATCH_WINDOW_DAYS - 1)

        assert await _reply() == "forwarded"

    @pytest.mark.parametrize(
        ("status", "error_code"),
        [("queued", None), ("failed", ERROR_SMS_NETWORK), ("failed", "sms_21211"), ("failed", "sms_failed: 30007")],
        ids=["still_queued", "never_reached_twilio", "refused_by_twilio", "undelivered"],
    )
    async def test_a_text_that_never_reached_the_tenant(
        self, db: AsyncSession, wired, status: str, error_code: str | None,
    ) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord), status=status, error_code=error_code)

        assert await _reply() == "unmatched"
        wired.assert_not_awaited()

    async def test_a_deleted_tenant(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _text(db, landlord, sonu)
        sonu.deleted_at = NOW
        await db.flush()

        assert await _reply() == "unreachable"
        wired.assert_not_awaited()

    async def test_a_landlord_no_longer_in_the_workspace(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))
        await db.delete(landlord)
        await db.flush()

        assert await _reply() == "unreachable"
        wired.assert_not_awaited()

    async def test_a_deactivated_landlord(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))
        user = await db.get(User, landlord.user_id)
        assert user is not None
        user.is_active = False
        await db.flush()

        assert await _reply() == "unreachable"
        wired.assert_not_awaited()

    @pytest.mark.parametrize(
        "sender",
        ["", "7135550100", "(713) 555-0100", "whatsapp:+17135550100", "+1 713 555 0100"],
        ids=["missing", "no_plus", "formatted", "whatsapp", "spaced"],
    )
    async def test_a_sender_that_isnt_a_phone_number(self, wired, no_database, sender: str) -> None:
        assert await _reply(From=sender) == "not_for_us"
        wired.assert_not_awaited()

    @pytest.mark.parametrize("to", ["+18885550199", "", "whatsapp:+18885550100"])
    async def test_a_text_to_another_number(self, wired, no_database, to: str) -> None:
        assert await _reply(To=to) == "not_for_us"
        wired.assert_not_awaited()

    async def test_nothing_when_twilio_isnt_set_up(self, wired, no_database) -> None:
        with patch.object(settings, "sms_backend", "console"):
            assert await _reply() == "not_for_us"
        wired.assert_not_awaited()


class TestOptOutKeywords:
    @pytest.mark.parametrize("body", ["STOP", "stop", " Unsubscribe "])
    async def test_stop(self, db: AsyncSession, wired, body: str) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply(body) == "forwarded"

        _, subject, html = _sent(wired)
        assert subject == "Sonu asked you to stop texting"
        assert "your next rent text to Sonu won't go through" in html

    async def test_start_after_a_text_twilio_blocked_reaches_the_landlord(
        self, db: AsyncSession, wired,
    ) -> None:
        """Twilio refuses texts to a number that sent STOP (21610). That landlord
        did text the number, and the START is the reply they most need."""
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord), status="failed", error_code=ERROR_SMS_OPTED_OUT)

        assert await _reply("START") == "forwarded"
        assert _sent(wired)[1] == "Sonu can get your rent texts again"

    async def test_help_that_twilio_passed_on(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply("help", OptOutType="HELP") == "forwarded"
        assert _sent(wired)[1] == "Sonu asked for help with your rent texts"

    async def test_a_text_that_may_have_arrived_still_matches(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(
            db, landlord, await _tenant(db, landlord), status="failed", error_code=ERROR_SMS_OUTCOME_UNKNOWN,
        )

        assert await _reply() == "forwarded"


class TestPicturesAndFiles:
    async def test_says_what_was_sent_and_never_links_to_it(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))
        media_url = "https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME"

        assert await _reply(
            "Receipt attached",
            NumMedia="2",
            MediaContentType0="image/jpeg",
            MediaUrl0=f"{media_url}0",
            MediaContentType1="application/pdf",
            MediaUrl1=f"{media_url}1",
        ) == "forwarded"

        _, _, html = _sent(wired)
        assert ">Receipt attached</blockquote>" in html
        assert "They also sent 1 picture and 1 other file." in html
        assert "api.twilio.com" not in html

    async def test_a_picture_with_no_text(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        assert await _reply("", NumMedia="1", MediaContentType0="image/png") == "forwarded"
        assert "replied to your text about rent due Nov 22 with 1 picture and no message." in _sent(wired)[2]


class TestHourlyLimit:
    async def test_a_number_texting_in_a_loop_gets_its_share_then_nothing(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))

        outcomes = [await _reply() for _ in range(REPLY_FORWARD_LIMIT)]
        with caplog.at_level(logging.INFO, logger=reply.__name__):
            assert await _reply() == "over_limit"

        assert outcomes == ["forwarded"] * REPLY_FORWARD_LIMIT
        assert wired.await_count == REPLY_FORWARD_LIMIT
        assert f"over its hourly limit: sid={MESSAGE_SID}" in caplog.text

    async def test_each_number_has_its_own_share(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        await _text(db, landlord, await _tenant(db, landlord))
        await _text(db, landlord, await _tenant(db, landlord, name="Ravi Patel"), phone="+17135550199")

        for _ in range(REPLY_FORWARD_LIMIT):
            assert await _reply() == "forwarded"
        assert await _reply(From="+17135550199") == "forwarded"


class TestEmailFailure:
    async def test_a_failed_email_is_logged_without_the_reply(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        text = await _text(db, landlord, sonu)
        wired.return_value = False

        with caplog.at_level(logging.INFO, logger=reply.__name__):
            assert await _reply("Paid via Zelle") == "forwarded"

        [warning] = [
            record for record in _app_records(caplog) if record.levelno >= logging.WARNING
        ]
        assert warning.getMessage() == (
            "Could not email a tenant's reply to its landlord: "
            f"sid={MESSAGE_SID} send_id={text.id}"
        )


class TestLogs:
    async def test_never_carry_the_reply_or_the_senders_number(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        jason = await _landlord(db, email="jason@example.com")
        sonu = await _tenant(db, jason)
        await _text(db, jason, sonu)
        secret_words = "the door code is under the mat"

        with caplog.at_level(logging.DEBUG, logger="app"), caplog.at_level(
            logging.DEBUG, logger="platform_shared",
        ):
            for overrides in ({}, {"From": "+17135550199"}, {"To": "+18885550199"}):
                await _reply(secret_words, **overrides)
            sonu.deleted_at = NOW
            await db.flush()
            await _reply(secret_words)
            wired.return_value = False
            sonu.deleted_at = None
            await db.flush()
            await _reply(secret_words)

        logged = "\n".join(record.getMessage() for record in _app_records(caplog))
        assert logged.count(f"sid={MESSAGE_SID}") == 6
        for secret in (secret_words, "door code", "5550100", "5550199", "555-01", "jason@example.com", "Sonu"):
            assert secret not in logged


@pytest.mark.usefixtures("fresh_inbound_limit")
class TestThroughTheWebhook:
    async def test_a_tenants_signed_reply_reaches_the_landlords_inbox(self, db: AsyncSession, wired) -> None:
        landlord = await _landlord(db)
        sonu = await _tenant(db, landlord)
        await _text(db, landlord, sonu)
        params = _inbound("Paid <b>today</b> & thanks")
        signature = RequestValidator(AUTH_TOKEN).compute_signature(INBOUND_URL, params)

        with patch.object(reply, "_now", return_value=NOW):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/rent-reminders/sms/inbound", data=params, headers={"X-Twilio-Signature": signature},
                )
            await drain_tracked()

        assert response.status_code == 200
        assert response.text == TWILIO_EMPTY_TWIML
        to, subject, html = _sent(wired)
        assert to == ["jason@example.com"]
        assert subject == "Sonu replied to your rent text"
        assert ">Paid &lt;b&gt;today&lt;/b&gt; &amp; thanks</blockquote>" in html
        assert f'href="{PUBLIC_ORIGIN}/tenants/{sonu.id}"' in html
