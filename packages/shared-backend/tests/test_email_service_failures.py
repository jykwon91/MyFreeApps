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
import threading
import time
from email.mime.multipart import MIMEMultipart
from unittest.mock import MagicMock, patch

import pytest

from platform_shared.core.email_constants import SMTP_TIMEOUT_SECONDS
from platform_shared.services.email_send_error import EmailSendError
from platform_shared.services.email_service import EmailService


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


def _send_failure(server: MagicMock, to: list[str] | None = None) -> EmailSendError:
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
        assert "delivered to the other 1" in str(error)
        assert any("b@example.com" in r.getMessage() for r in caplog.records)

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
        assert exc.value.__cause__ is bad

    def test_non_ascii_recipient_is_a_send_error(self) -> None:
        with patch("smtplib.SMTP", _OfflineSmtp), pytest.raises(EmailSendError) as exc:
            _service().send_or_raise(["jos\u00e9@example.com"], "subj", "<p>b</p>")
            assert _service().send(["jos\u00e9@example.com"], "subj", "<p>b</p>") is False
        assert exc.value.kind == "message_rejected"
        assert isinstance(exc.value.__cause__, UnicodeEncodeError)


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

