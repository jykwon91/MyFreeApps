"""EmailService failure handling: the SMTP timeout, the typed EmailSendError,
refused recipients, QUIT-after-send, and the *_async methods that keep the
blocking SMTP conversation off the event loop."""
import asyncio
import email.errors
import io
import logging
import pickle
import smtplib
import socket
import ssl
import threading
import time
import traceback
from email.mime.multipart import MIMEMultipart
from unittest.mock import MagicMock, patch

import pytest
from platform_shared.core.email_constants import SMTP_TIMEOUT_SECONDS
from platform_shared.services.email_failure_kind import EmailFailureKind
from platform_shared.services.email_send_error import EmailSendError
from platform_shared.services.email_service import EmailService
from platform_shared.services.smtp_failure import error_from_refused_recipients


def _service() -> EmailService:
    return EmailService(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="user@example.com",
        smtp_password="s3cr3t",
        from_name="TestApp",
    )


def _server() -> MagicMock:
    server = MagicMock()
    server.sendmail.return_value = {}
    return server


def _send_failure(server: smtplib.SMTP | MagicMock, to: list[str] | None = None) -> EmailSendError:
    with patch("smtplib.SMTP", return_value=server), pytest.raises(EmailSendError) as exc:
        _service().send_or_raise(to or ["x@example.com"], "subj", "<p>b</p>")
    return exc.value


class TestTimeout:
    def test_connection_is_opened_with_the_timeout(self) -> None:
        with patch("smtplib.SMTP", return_value=_server()) as smtp_cls:
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        smtp_cls.assert_called_once_with(
            "smtp.example.com", 587, timeout=SMTP_TIMEOUT_SECONDS,
        )

    def test_timeout_is_bounded(self) -> None:
        assert 0 < SMTP_TIMEOUT_SECONDS <= 60

    def test_stall_becomes_a_transient_error(self) -> None:
        server = _server()
        server.sendmail.side_effect = TimeoutError("timed out")
        error = _send_failure(server)
        assert error.kind == "transient"
        assert error.smtp_code is None
        server.close.assert_called_once()


class TestClassification:
    def test_bad_credentials_are_misconfigured_with_code(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        server = _server()
        server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"5.7.8 Bad credentials")
        with caplog.at_level(logging.WARNING):
            error = _send_failure(server)
        assert error.kind == "misconfigured"
        assert error.smtp_code == 535
        record = next(r for r in caplog.records if "SMTP send failed" in r.getMessage())
        assert record.levelno == logging.ERROR
        assert "kind=misconfigured" in record.getMessage()
        assert "smtp_code=535" in record.getMessage()

    def test_sender_refused_is_misconfigured(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPSenderRefused(
            553, b"sender not owned", "user@example.com",
        )
        error = _send_failure(server)
        assert (error.kind, error.smtp_code) == ("misconfigured", 553)
        assert error.failed_before_handover

    def test_starttls_unsupported_is_misconfigured(self) -> None:
        server = _server()
        server.starttls.side_effect = smtplib.SMTPNotSupportedError("STARTTLS not supported")
        assert _send_failure(server).kind == "misconfigured"

    def test_permanent_data_rejection(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(554, b"message refused")
        error = _send_failure(server)
        assert (error.kind, error.smtp_code) == ("message_rejected", 554)

    def test_temporary_reply_is_transient(self, caplog: pytest.LogCaptureFixture) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(421, b"try again later")
        with caplog.at_level(logging.WARNING):
            error = _send_failure(server)
        assert (error.kind, error.smtp_code) == ("transient", 421)
        record = next(r for r in caplog.records if "SMTP send failed" in r.getMessage())
        assert record.levelno == logging.WARNING

    def test_dropped_connection_is_transient(self) -> None:
        server = _server()
        server.login.side_effect = smtplib.SMTPServerDisconnected("closed")
        assert _send_failure(server).kind == "transient"

    def test_unreachable_host_is_transient(self) -> None:
        with patch("smtplib.SMTP", side_effect=ConnectionRefusedError("refused")), pytest.raises(EmailSendError) as exc:
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        assert exc.value.kind == "transient"

    def test_bugs_are_not_disguised_as_send_failures(self) -> None:
        server = _server()
        server.login.side_effect = TypeError("bug")
        with patch("smtplib.SMTP", return_value=server), pytest.raises(TypeError):
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        server.close.assert_called_once()


class TestDeliveryUnconfirmed:
    """Only a timeout, a dropped connection or a reply that isn't a clear refusal
    while the message is being handed over can leave the recipient holding it:
    before that, the server never had it."""

    @pytest.mark.parametrize("exc", [ConnectionRefusedError("refused"), TimeoutError("timed out")])
    def test_a_failed_connect_is_a_definite_failure(self, exc: Exception) -> None:
        with patch("smtplib.SMTP", side_effect=exc), pytest.raises(EmailSendError) as raised:
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        assert raised.value.kind == "transient"
        assert raised.value.failed_before_handover
        assert not raised.value.delivery_unconfirmed

    @pytest.mark.parametrize("step", ["starttls", "login"])
    @pytest.mark.parametrize(
        "exc",
        [TimeoutError("timed out"), smtplib.SMTPServerDisconnected("closed"), ssl.SSLError("handshake failed")],
    )
    def test_a_failure_setting_up_the_session_is_a_definite_failure(self, step: str, exc: Exception) -> None:
        server = _server()
        getattr(server, step).side_effect = exc
        error = _send_failure(server)
        assert error.kind == "transient"
        assert error.failed_before_handover
        assert not error.delivery_unconfirmed
        server.sendmail.assert_not_called()
        server.close.assert_called_once()

    @pytest.mark.parametrize(
        "exc",
        [TimeoutError("timed out"), smtplib.SMTPServerDisconnected("closed"), ConnectionResetError("reset")],
    )
    def test_a_timeout_or_drop_while_handing_over_leaves_delivery_unconfirmed(
        self, exc: Exception, caplog: pytest.LogCaptureFixture,
    ) -> None:
        server = _server()
        server.sendmail.side_effect = exc
        with caplog.at_level(logging.WARNING):
            error = _send_failure(server)
        assert error.kind == "transient"
        assert not error.failed_before_handover
        assert error.delivery_unconfirmed
        server.close.assert_called_once()
        record = next(r for r in caplog.records if "SMTP send failed" in r.getMessage())
        assert "unconfirmed=True" in record.getMessage()

    def test_a_reply_while_handing_over_is_a_definite_failure(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(421, b"try again later")
        assert not _send_failure(server).delivery_unconfirmed

    def test_a_final_reply_that_isnt_a_clear_refusal_leaves_delivery_unconfirmed(self) -> None:
        # RFC 5321 defines no 6xx, so the server may have taken the message.
        server, sock = _scripted_server(
            b"250 sender ok\r\n250 recipient ok\r\n354 go ahead\r\n650 what\r\n250 reset\r\n",
        )
        error = _send_failure(server)
        assert b"Subject: subj" in _sent(sock)
        assert (error.kind, error.smtp_code) == ("transient", None)
        assert not error.failed_before_handover
        assert error.delivery_unconfirmed

    @pytest.mark.parametrize(
        "reply",
        [
            pytest.param(b"251 2.1.0 sender ok\r\n", id="a-251"),
            pytest.param(b"not a reply\r\n", id="unreadable"),
            pytest.param(b"650 what\r\n", id="a-650"),
        ],
    )
    def test_a_refused_sender_is_a_definite_failure_whatever_its_code(self, reply: bytes) -> None:
        # smtplib gives up after MAIL FROM, before any recipient or the message.
        server, sock = _scripted_server(reply + b"250 reset\r\n")
        error = _send_failure(server)
        assert b"x@example.com" not in _sent(sock)
        assert (error.kind, error.smtp_code) == ("transient", None)
        assert error.failed_before_handover
        assert not error.delivery_unconfirmed

    def test_an_error_that_does_not_say_where_it_failed_counts_as_unconfirmed(self) -> None:
        # Telling a caller that a timeout definitely failed would invite a duplicate email.
        assert EmailSendError("timed out", kind="transient").delivery_unconfirmed


class TestReplyLineTooLong:
    """smtplib makes up a 500 "Line too long." and closes the connection when a
    reply line runs past 8192 bytes. The server never sent that 500."""

    def test_while_handing_over_it_leaves_delivery_unconfirmed(self) -> None:
        # The overlong line is the server's answer to the message, which it may have taken.
        server, sock = _scripted_server(
            b"250 sender ok\r\n250 recipient ok\r\n354 go ahead\r\n250 " + b"x" * 9000 + b"\r\n",
        )
        error = _send_failure(server)
        assert b"Subject: subj" in _sent(sock)
        assert (error.kind, error.smtp_code) == ("transient", None)
        assert error.delivery_unconfirmed

    def test_while_connecting_it_is_a_definite_failure(self) -> None:
        greeting = MagicMock()
        greeting.makefile.return_value = io.BytesIO(b"220 " + b"x" * 9000 + b"\r\n")
        with patch.object(smtplib.SMTP, "_get_socket", return_value=greeting), \
                pytest.raises(EmailSendError) as exc:
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        assert (exc.value.kind, exc.value.smtp_code) == ("transient", None)
        assert exc.value.failed_before_handover
        assert not exc.value.delivery_unconfirmed

    def test_a_server_replying_500_line_too_long_is_refusing_the_message(self) -> None:
        server, _sock = _scripted_server(
            b"250 sender ok\r\n250 recipient ok\r\n354 go ahead\r\n500 Line too long.\r\n250 reset\r\n",
        )
        error = _send_failure(server)
        assert (error.kind, error.smtp_code) == ("message_rejected", 500)


class TestRecipientsAreNotLogged:
    def test_a_successful_send_logs_the_count_and_domain_only(self, caplog: pytest.LogCaptureFixture) -> None:
        with patch("smtplib.SMTP", return_value=_server()), caplog.at_level(logging.INFO):
            _service().send_or_raise(["a@example.com", "b@example.org"], "subj", "<p>b</p>")
        assert "2 recipient(s) at example.com, example.org" in caplog.text
        assert "a@example.com" not in caplog.text and "b@example.org" not in caplog.text

    def test_a_best_effort_failure_logs_the_count_and_domain_only(self, caplog: pytest.LogCaptureFixture) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPRecipientsRefused({"x@example.com": (550, b"no")})
        with patch("smtplib.SMTP", return_value=server), caplog.at_level(logging.WARNING):
            assert _service().send(["x@example.com"], "subj", "<p>b</p>") is False
        assert "x@example.com" not in caplog.text


class TestSubjectsAreNotLogged:
    """Subjects name tenants and applicants ("Your lease, Jane Doe")."""

    _SUBJECT = "Your lease, Jane Doe"

    def test_a_successful_send_does_not_log_the_subject(self, caplog: pytest.LogCaptureFixture) -> None:
        with patch("smtplib.SMTP", return_value=_server()), caplog.at_level(logging.INFO):
            _service().send_or_raise(["a@example.com"], self._SUBJECT, "<p>b</p>")
        assert "Email sent via SMTP to 1 recipient(s) at example.com" in caplog.text
        assert "Jane Doe" not in caplog.text

    def test_a_failed_send_does_not_log_the_subject(self, caplog: pytest.LogCaptureFixture) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(554, b"rejected")
        with patch("smtplib.SMTP", return_value=server), caplog.at_level(logging.WARNING):
            assert _service().send(["a@example.com"], self._SUBJECT, "<p>b</p>") is False
        assert "smtp_code=554" in caplog.text
        assert "Jane Doe" not in caplog.text


class TestErrorMessagesCarryNoAddress:
    def test_a_reply_quoting_the_recipient_is_cut_to_its_domain(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(
            550, b"5.1.1 <jane.doe@example.com>: Recipient address rejected",
        )
        error = _send_failure(server, ["jane.doe@example.com"])
        assert error.smtp_code == 550
        assert "jane.doe" not in str(error)
        assert "***@example.com" in str(error)

    def test_an_unencodable_address_is_not_quoted(self) -> None:
        server = _server()
        server.sendmail.side_effect = UnicodeEncodeError(
            "ascii", "RCPT TO:<jos\u00e9@example.com>", 12, 13, "ordinal not in range(128)",
        )
        error = _send_failure(server, ["jos\u00e9@example.com"])
        assert error.kind == "message_rejected"
        assert "jos" not in str(error)
        assert "UnicodeEncodeError" in str(error)

    def test_the_smtp_exception_is_not_chained_into_the_traceback(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPDataError(
            550, b"5.1.1 <jane.doe@example.com>: Recipient address rejected",
        )
        error = _send_failure(server, ["jane.doe@example.com"])
        # The traceback is what uvicorn logs at ERROR and Sentry sends.
        assert error.__cause__ is None
        assert "jane.doe" not in "".join(traceback.format_exception(error))

    def test_masking_survives_pickling(self) -> None:
        error = EmailSendError("refused <bob@example.com>", kind="recipient_rejected")
        assert str(pickle.loads(pickle.dumps(error))) == "refused <***@example.com>"


class TestRefusedRecipients:
    def test_every_recipient_refused(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPRecipientsRefused(
            {"x@example.com": (550, b"5.1.1 no such user")},
        )
        error = _send_failure(server)
        assert error.kind == "recipient_rejected"
        assert error.smtp_code == 550
        assert error.refused_recipients == {"x@example.com": 550}
        assert error.failed_before_handover
        assert "nobody got the email" in str(error)
        assert "delivered" not in str(error)

    def test_partial_refusal_raises_and_names_the_refused(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        server = _server()
        server.sendmail.return_value = {"b@example.com": (550, b"no such user")}
        with caplog.at_level(logging.WARNING):
            error = _send_failure(server, ["a@example.com", "b@example.com"])
        assert error.kind == "recipient_rejected"
        assert error.refused_recipients == {"b@example.com": 550}
        assert not error.failed_before_handover
        assert "delivered to the other 1" in str(error)
        failure = next(r.getMessage() for r in caplog.records if "SMTP send failed" in r.getMessage())
        assert "refused=1" in failure and "2 recipient(s) at example.com" in failure
        assert "@example.com" not in failure.replace("at example.com", "")
        assert "b@example.com" not in str(error)

    def test_partial_refusal_fails_a_best_effort_send(self) -> None:
        server = _server()
        server.sendmail.return_value = {"b@example.com": (550, b"no such user")}
        with patch("smtplib.SMTP", return_value=server):
            ok = _service().send(["a@example.com", "b@example.com"], "subj", "<p>b</p>")
        assert ok is False

    def test_greylisted_recipient_is_transient(self) -> None:
        server = _server()
        server.sendmail.side_effect = smtplib.SMTPRecipientsRefused(
            {"x@example.com": (450, b"greylisted")},
        )
        assert _send_failure(server).kind == "transient"

    def test_a_421_partway_through_the_recipients_sends_to_nobody(self) -> None:
        # smtplib stops at a 421 (the server is closing the session) and never
        # sends the message: the recipient accepted before it doesn't get it,
        # and the one after it is never tried.
        server, sock = _scripted_server(b"250 sender ok\r\n250 recipient ok\r\n421 4.7.0 closing\r\n")
        error = _send_failure(server, ["a@example.com", "b@example.com", "c@example.com"])
        assert b"Subject: subj" not in _sent(sock)
        assert error.refused_recipients == {"b@example.com": 421}
        assert "refused 1 of 3 recipient(s)" in str(error)
        assert (error.kind, error.smtp_code) == ("transient", 421)
        assert error.failed_before_handover
        assert not error.delivery_unconfirmed
        assert "nobody got the email" in str(error)
        assert "delivered" not in str(error)

    def test_a_421_after_a_permanent_refusal_is_transient(self) -> None:
        # The 421 sums it up, not the 550 before it: the server closed the
        # session before c was tried, so nobody got the email and a retry can
        # still reach b and c.
        server, sock = _scripted_server(b"250 sender ok\r\n550 5.1.1 no such user\r\n421 4.7.0 closing\r\n")
        error = _send_failure(server, ["a@example.com", "b@example.com", "c@example.com"])
        assert b"c@example.com" not in _sent(sock)
        assert error.refused_recipients == {"a@example.com": 550, "b@example.com": 421}
        assert (error.kind, error.smtp_code) == ("transient", 421)
        assert error.failed_before_handover
        assert not error.delivery_unconfirmed

    def test_an_unreadable_reply_for_the_only_recipient_is_a_definite_failure(self) -> None:
        # smtplib reads a reply line with no number for its code as -1; with
        # every recipient refused it never sends the message.
        server, sock = _scripted_server(b"250 sender ok\r\nnot a reply\r\n")
        error = _send_failure(server)
        assert b"Subject: subj" not in _sent(sock)
        assert error.refused_recipients == {"x@example.com": -1}
        assert (error.kind, error.smtp_code) == ("transient", None)
        assert error.failed_before_handover
        assert not error.delivery_unconfirmed
        assert "(reply codes: unreadable); nobody got the email" in str(error)

    @pytest.mark.parametrize(
        ("replies", "to", "refused"),
        [
            pytest.param(
                b"250 sender ok\r\nnot a reply\r\n250 recipient ok\r\n354 go ahead\r\n250 queued\r\n",
                ["a@example.com", "b@example.com"],
                {"a@example.com": -1},
                id="unreadable",
            ),
            pytest.param(
                b"250 sender ok\r\n550 no such user\r\nnot a reply\r\n250 recipient ok\r\n354 go ahead\r\n250 queued\r\n",
                ["a@example.com", "b@example.com", "c@example.com"],
                {"a@example.com": 550, "b@example.com": -1},
                id="unreadable-beside-a-refusal",
            ),
            pytest.param(
                # smtplib reads the first three characters, " 25", as 25.
                b"250 sender ok\r\n 250 2.1.5 ok\r\n250 recipient ok\r\n354 go ahead\r\n250 queued\r\n",
                ["a@example.com", "b@example.com"],
                {"a@example.com": 25},
                id="garbled-into-a-number",
            ),
            pytest.param(
                b"250 sender ok\r\n252 2.1.5 will try\r\n250 recipient ok\r\n354 go ahead\r\n250 queued\r\n",
                ["a@example.com", "b@example.com"],
                {"a@example.com": 252},
                id="a-252",
            ),
            pytest.param(
                # RFC 5321 defines no 6xx reply.
                b"250 sender ok\r\n650 what\r\n250 recipient ok\r\n354 go ahead\r\n250 queued\r\n",
                ["a@example.com", "b@example.com"],
                {"a@example.com": 650},
                id="a-650",
            ),
        ],
    )
    def test_an_unclear_reply_leaves_delivery_unconfirmed_when_the_rest_got_it(
        self, replies: bytes, to: list[str], refused: dict[str, int],
    ) -> None:
        # The server took the message, and smtplib lists the recipient whose
        # reply wasn't a clear refusal as refused, though they may have been
        # accepted with it: a resend could duplicate it.
        server, sock = _scripted_server(replies)
        error = _send_failure(server, to)
        assert b"Subject: subj" in _sent(sock)
        assert error.refused_recipients == refused
        assert (error.kind, error.smtp_code) == ("transient", None)
        assert not error.failed_before_handover
        assert error.delivery_unconfirmed
        assert "delivered to the other 1, and maybe to the 1 whose reply wasn't a clear refusal" in str(error)


class TestRefusalSummary:
    """Which ``kind`` and ``smtp_code`` sum up a list of refused recipients."""

    @pytest.mark.parametrize(
        ("codes", "sent_to_the_rest", "kind", "smtp_code", "unconfirmed"),
        [
            pytest.param([550], False, "recipient_rejected", 550, False, id="permanent"),
            pytest.param([450], False, "transient", 450, False, id="temporary"),
            pytest.param([550, 553], False, "recipient_rejected", 550, False, id="first-permanent-code"),
            pytest.param([450, 451], False, "transient", 450, False, id="first-temporary-code"),
            pytest.param([550, 421], False, "transient", 421, False, id="421-after-a-refusal"),
            pytest.param([550, 450], False, "transient", 450, False, id="temporary-beside-permanent-and-nobody-got-it"),
            pytest.param([450, 550], True, "recipient_rejected", 550, False, id="permanent-beside-temporary-and-the-rest-got-it"),
            pytest.param([450], True, "transient", 450, False, id="temporary-and-the-rest-got-it"),
            pytest.param([400], False, "transient", 400, False, id="the-lowest-temporary-code"),
            pytest.param([499], False, "transient", 499, False, id="the-highest-temporary-code"),
            pytest.param([499], True, "transient", 499, False, id="the-highest-temporary-code-and-the-rest-got-it"),
            pytest.param([500], False, "recipient_rejected", 500, False, id="the-lowest-permanent-code"),
            pytest.param([599], False, "recipient_rejected", 599, False, id="the-highest-permanent-code"),
            pytest.param([-1], False, "transient", None, False, id="unreadable-and-nobody-got-it"),
            pytest.param([-1], True, "transient", None, True, id="unreadable-and-the-rest-got-it"),
            pytest.param([-50], True, "transient", None, True, id="another-negative-code"),
            pytest.param([550, -1], True, "transient", None, True, id="unreadable-beside-a-refusal"),
            pytest.param([550, -1], False, "transient", None, False, id="unreadable-after-a-refusal-and-nobody-got-it"),
            pytest.param([-1, 421], False, "transient", None, False, id="unreadable-before-a-421"),
            pytest.param([25], True, "transient", None, True, id="garbled-into-a-number"),
            pytest.param([0], True, "transient", None, True, id="zero"),
            pytest.param([150], True, "transient", None, True, id="a-1xx"),
            pytest.param([252], True, "transient", None, True, id="a-252"),
            pytest.param([550, 252], False, "transient", None, False, id="a-252-beside-a-refusal-and-nobody-got-it"),
            pytest.param([399], True, "transient", None, True, id="just-under-4xx"),
            pytest.param([600], True, "transient", None, True, id="just-past-5xx"),
            pytest.param([600], False, "transient", None, False, id="past-5xx-and-nobody-got-it"),
            pytest.param([999], True, "transient", None, True, id="the-highest-three-digit-code"),
            pytest.param([550, 650], True, "transient", None, True, id="past-5xx-beside-a-refusal"),
        ],
    )
    def test_kind_and_code(
        self,
        codes: list[int],
        sent_to_the_rest: bool,
        kind: EmailFailureKind,
        smtp_code: int | None,
        unconfirmed: bool,
    ) -> None:
        error = error_from_refused_recipients(
            {f"r{index}@example.com": (code, b"reply") for index, code in enumerate(codes)},
            recipient_count=len(codes) + 1,
            sent_to_the_rest=sent_to_the_rest,
        )
        assert (error.kind, error.smtp_code, error.delivery_unconfirmed) == (kind, smtp_code, unconfirmed)

    def test_the_message_counts_every_reply_that_wasnt_a_clear_refusal(self) -> None:
        error = error_from_refused_recipients(
            {
                "a@example.com": (-1, b"not a reply"),
                "b@example.com": (-50, b"x"),
                "c@example.com": (252, b"will try"),
                "d@example.com": (550, b"no such user"),
            },
            recipient_count=5,
            sent_to_the_rest=True,
        )
        assert str(error) == (
            "SMTP server refused 4 of 5 recipient(s) (reply codes: unreadable, unreadable, 252, 550); "
            "delivered to the other 1, and maybe to the 3 whose reply wasn't a clear refusal"
        )


class TestQuitAfterSend:
    def test_failed_quit_after_accepted_send_is_not_a_failure(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        server = _server()
        server.quit.side_effect = smtplib.SMTPServerDisconnected("gone")
        with patch("smtplib.SMTP", return_value=server), caplog.at_level(logging.WARNING):
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        server.close.assert_called_once()
        assert "treating the send as delivered" in caplog.text

    def test_successful_send_quits_cleanly(self) -> None:
        server = _server()
        with patch("smtplib.SMTP", return_value=server):
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        server.quit.assert_called_once()


class TestAsyncMethods:
    async def test_send_or_raise_async_runs_off_the_event_loop(self) -> None:
        loop_thread = threading.get_ident()
        send_threads: list[int] = []
        server = _server()
        server.sendmail.side_effect = lambda *_: send_threads.append(threading.get_ident()) or {}
        with patch("smtplib.SMTP", return_value=server):
            await _service().send_or_raise_async(["x@example.com"], "subj", "<p>b</p>")
        assert send_threads and send_threads[0] != loop_thread

    async def test_slow_smtp_server_does_not_freeze_the_loop(self) -> None:
        server = _server()
        server.sendmail.side_effect = lambda *_: time.sleep(0.3) or {}
        ticks = 0

        async def ticker() -> None:
            nonlocal ticks
            while True:
                await asyncio.sleep(0.01)
                ticks += 1

        with patch("smtplib.SMTP", return_value=server):
            task = asyncio.create_task(ticker())
            await _service().send_or_raise_async(["x@example.com"], "subj", "<p>b</p>")
            task.cancel()
        assert ticks >= 5

    async def test_send_or_raise_async_raises_typed_error(self) -> None:
        server = _server()
        server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"bad")
        with patch("smtplib.SMTP", return_value=server), pytest.raises(EmailSendError) as exc:
            await _service().send_or_raise_async(["x@example.com"], "subj", "<p>b</p>")
        assert exc.value.smtp_code == 535

    async def test_send_async_returns_bool(self) -> None:
        server = _server()
        with patch("smtplib.SMTP", return_value=server):
            assert await _service().send_async(["x@example.com"], "subj", "<p>b</p>") is True
        server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"bad")
        with patch("smtplib.SMTP", return_value=server):
            assert await _service().send_async(["x@example.com"], "subj", "<p>b</p>") is False

    async def test_async_methods_pass_attachments_and_reply_to(self) -> None:
        captured: list[str] = []
        server = _server()
        server.sendmail.side_effect = lambda _f, _t, raw: captured.append(raw) or {}
        with patch("smtplib.SMTP", return_value=server):
            await _service().send_or_raise_async(
                ["x@example.com"], "subj", "<p>b</p>", reply_to="host@example.com",
            )
        assert "Reply-To: host@example.com" in captured[0]


class _OfflineSmtp(smtplib.SMTP):
    """Real smtplib command encoding over a fake socket that answers 250."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        super().__init__()
        self.sock = MagicMock()
        self.file = io.BytesIO(b"250 ok\r\n" * 10)
        self.ehlo_resp = b"ok"
        self.esmtp_features = {}

    def starttls(self, *_args: object, **_kwargs: object) -> tuple[int, bytes]:
        return 220, b"ready"

    def login(self, *_args: object, **_kwargs: object) -> tuple[int, bytes]:
        return 235, b"ok"


def _scripted_server(replies: bytes) -> tuple[_OfflineSmtp, MagicMock]:
    """An ``_OfflineSmtp`` whose server answers with ``replies``, in order, and
    its fake socket, which smtplib lets go of when it closes the connection."""
    server = _OfflineSmtp()
    sock = MagicMock()
    server.sock = sock
    server.file = io.BytesIO(replies)
    return server, sock


def _sent(sock: MagicMock) -> bytes:
    """Everything smtplib wrote to the fake socket."""
    return b"".join(call.args[0] for call in sock.sendall.call_args_list)


class TestUnsendableMessages:
    def _raw_sent(self, **kwargs: str) -> str:
        captured: list[str] = []
        server = _server()
        server.sendmail.side_effect = lambda _f, _t, raw: captured.append(raw) or {}
        service = _service()
        service.from_name = kwargs.pop("from_name", service.from_name)
        with patch("smtplib.SMTP", return_value=server):
            service.send_or_raise(
                [kwargs.pop("to", "x@example.com")], kwargs.pop("subject", "subj"), "<p>b</p>",
                reply_to=kwargs.pop("reply_to", None),
            )
        return captured[0]

    def test_line_break_in_subject_cannot_add_a_header(self) -> None:
        raw = self._raw_sent(subject="Lease for x\nBcc: attacker@example.com")
        headers = raw.split("\n\n", 1)[0]
        assert "\nBcc:" not in headers
        assert "Subject: Lease for x Bcc: attacker@example.com" in headers

    def test_line_breaks_stripped_from_names_and_addresses(self) -> None:
        raw = self._raw_sent(
            from_name="Acme\r\nBcc: a@example.com",
            reply_to="host@example.com\nBcc: b@example.com",
            to="guest@example.com\r\nCc: c@example.com",
        )
        headers = raw.split("\n\n", 1)[0]
        for injected in ("\nBcc:", "\nCc:"):
            assert injected not in headers

    def test_unencodable_message_is_a_send_error(self) -> None:
        bad = email.errors.HeaderParseError("Header value appears to contain an embedded header")
        with patch.object(MIMEMultipart, "as_string", side_effect=bad), \
                patch("smtplib.SMTP", return_value=_server()):
            assert _service().send(["x@example.com"], "subj", "<p>b</p>") is False
            with pytest.raises(EmailSendError) as exc:
                _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        assert exc.value.kind == "message_rejected"
        assert exc.value.__cause__ is None
        assert "HeaderParseError" in str(exc.value)

    def test_non_ascii_recipient_is_a_send_error(self) -> None:
        with patch("smtplib.SMTP", _OfflineSmtp), pytest.raises(EmailSendError) as exc:
            _service().send_or_raise(["jos\u00e9@example.com"], "subj", "<p>b</p>")
            assert _service().send(["jos\u00e9@example.com"], "subj", "<p>b</p>") is False
        assert exc.value.kind == "message_rejected"
        assert exc.value.__cause__ is None
        assert "UnicodeEncodeError" in str(exc.value)


class TestConfigFaults:
    @pytest.mark.parametrize(
        ("raised", "kind"),
        [
            (smtplib.SMTPAuthenticationError(454, b"4.7.0 too many login attempts"), "transient"),
            (smtplib.SMTPSenderRefused(451, b"try later", "user@example.com"), "transient"),
            (smtplib.SMTPHeloError(501, b"bad helo"), "misconfigured"),
            (smtplib.SMTPConnectError(554, b"no service for you"), "misconfigured"),
            (smtplib.SMTPConnectError(421, b"busy"), "transient"),
        ],
    )
    def test_reply_code_decides_between_config_and_retry(
        self, raised: smtplib.SMTPResponseException, kind: str,
    ) -> None:
        server = _server()
        server.login.side_effect = raised
        error = _send_failure(server)
        assert (error.kind, error.smtp_code) == (kind, raised.smtp_code)

    def test_no_usable_auth_method_is_misconfigured(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        server = _server()
        server.login.side_effect = smtplib.SMTPException("No suitable authentication method found.")
        with caplog.at_level(logging.WARNING):
            assert _send_failure(server).kind == "misconfigured"
        assert any(
            r.levelno == logging.ERROR and "SMTP send failed" in r.getMessage() for r in caplog.records
        )

    def test_untrusted_certificate_is_misconfigured(self, caplog: pytest.LogCaptureFixture) -> None:
        server = _server()
        server.starttls.side_effect = ssl.SSLCertVerificationError(
            1, "certificate verify failed: self-signed certificate",
        )
        with caplog.at_level(logging.WARNING):
            error = _send_failure(server)
        assert (error.kind, error.failed_before_handover) == ("misconfigured", True)
        server.sendmail.assert_not_called()
        assert any(
            r.levelno == logging.ERROR and "SMTP send failed" in r.getMessage() for r in caplog.records
        )

    def test_unknown_host_is_misconfigured(self, caplog: pytest.LogCaptureFixture) -> None:
        unknown_host = socket.gaierror(8, "nodename nor servname provided")
        with patch("smtplib.SMTP", side_effect=unknown_host), caplog.at_level(logging.WARNING), \
                pytest.raises(EmailSendError) as exc:
            _service().send_or_raise(["x@example.com"], "subj", "<p>b</p>")
        assert exc.value.kind == "misconfigured"
        assert any(
            r.levelno == logging.ERROR and "SMTP send failed" in r.getMessage() for r in caplog.records
        )


class TestPickling:
    def test_round_trips_with_its_fields(self) -> None:
        original = EmailSendError(
            "refused", kind="recipient_rejected", smtp_code=550,
            refused_recipients={"x@example.com": 550},
        )
        copy = pickle.loads(pickle.dumps(original))
        assert isinstance(copy, EmailSendError)
        assert str(copy) == "refused"
        assert (copy.kind, copy.smtp_code, copy.refused_recipients) == (
            "recipient_rejected", 550, {"x@example.com": 550},
        )

    def test_round_trips_where_it_failed(self) -> None:
        original = EmailSendError("refused", kind="transient", failed_before_handover=True)
        copy = pickle.loads(pickle.dumps(original))
        assert copy.failed_before_handover
        assert not copy.delivery_unconfirmed

    def test_an_error_pickled_before_the_field_existed_still_loads(self) -> None:
        copy = pickle.loads(_PICKLED_BEFORE_HANDOVER_FIELD)
        assert isinstance(copy, EmailSendError)
        assert (str(copy), copy.kind, copy.smtp_code, copy.refused_recipients) == (
            "timed out", "transient", None, {},
        )
        assert copy.delivery_unconfirmed


# ``pickle.dumps(EmailSendError("timed out", kind="transient"), protocol=4)`` as
# written before ``failed_before_handover`` existed, when ``_rebuild`` took four values.
_PICKLED_BEFORE_HANDOVER_FIELD = (
    b"\x80\x04\x95Z\x00\x00\x00\x00\x00\x00\x00\x8c)platform_shared.services.email_send_error"
    b"\x94\x8c\x08_rebuild\x94\x93\x94(\x8c\ttimed out\x94\x8c\ttransient\x94N}\x94t\x94R\x94."
)

