"""Tests for platform_shared.services.email_service.

Covers:
- STARTTLS hardening (CWE-327): starttls() must be called with an explicit
  ssl.SSLContext rather than no-arg (which is vulnerable to STARTTLS stripping
  by a MITM that can downgrade the connection before the upgrade handshake).
- Best-effort send() returning bool (for non-critical emails).
- Critical-path send_or_raise() raising on any failure (for verification,
  password reset, and other emails where silent loss leaves the user broken).
"""
import ssl
from unittest.mock import MagicMock, patch

import pytest

from platform_shared.services.email_service import (
    EmailNotConfiguredError,
    EmailSendError,
    EmailService,
)


def _configured_service() -> EmailService:
    return EmailService(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="user@example.com",
        smtp_password="s3cr3t",
        from_name="TestApp",
    )


class TestStarttlsContext:
    """starttls() must pass an explicit SSLContext (CWE-327 guard)."""

    def test_starttls_called_with_ssl_context(self) -> None:
        """Verify starttls receives a non-None SSLContext on a successful send."""
        service = _configured_service()
        mock_server = MagicMock()

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            service.send(["recipient@example.com"], "Subject", "<p>Body</p>")

        mock_server.starttls.assert_called_once()
        call_kwargs = mock_server.starttls.call_args
        context_arg = call_kwargs.kwargs.get("context") or (
            call_kwargs.args[0] if call_kwargs.args else None
        )
        assert context_arg is not None, (
            "starttls() was called without a context= argument — "
            "bare starttls() is vulnerable to STARTTLS stripping (CWE-327)"
        )
        assert isinstance(context_arg, ssl.SSLContext), (
            f"starttls(context=...) should be an ssl.SSLContext, got {type(context_arg)}"
        )

    def test_starttls_context_is_default_context(self) -> None:
        """The SSLContext should be created via ssl.create_default_context()
        so CA verification and hostname checking are on by default."""
        service = _configured_service()
        mock_server = MagicMock()
        captured: list[ssl.SSLContext] = []

        def _capture_starttls(*args: object, **kwargs: object) -> None:
            ctx = kwargs.get("context") or (args[0] if args else None)
            if isinstance(ctx, ssl.SSLContext):
                captured.append(ctx)

        mock_server.starttls.side_effect = _capture_starttls

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            service.send(["recipient@example.com"], "Subject", "<p>Body</p>")

        assert len(captured) == 1
        ctx = captured[0]
        # ssl.create_default_context() sets verify_mode=CERT_REQUIRED and
        # check_hostname=True by default — assert both.
        assert ctx.verify_mode == ssl.CERT_REQUIRED, (
            "SSLContext.verify_mode should be CERT_REQUIRED"
        )
        assert ctx.check_hostname is True, (
            "SSLContext.check_hostname should be True"
        )


class TestEmailServiceBehaviour:
    """Guard-rail tests for the rest of send() behaviour."""

    def test_send_returns_false_when_unconfigured(self) -> None:
        service = EmailService()
        assert service.send(["x@example.com"], "subj", "<p>body</p>") is False

    def test_send_returns_false_for_empty_recipients(self) -> None:
        service = _configured_service()
        assert service.send([], "subj", "<p>body</p>") is False

    def test_send_returns_false_on_smtp_exception(self) -> None:
        service = _configured_service()
        with patch("smtplib.SMTP", side_effect=OSError("connection refused")):
            result = service.send(["x@example.com"], "subj", "<p>body</p>")
        assert result is False

    def test_send_returns_true_on_success(self) -> None:
        service = _configured_service()
        mock_server = MagicMock()

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            result = service.send(["x@example.com"], "subj", "<p>body</p>")

        assert result is True


class TestSendOrRaise:
    """Critical-path send method — raises rather than silently returning False."""

    def test_raises_email_not_configured_when_creds_missing(self) -> None:
        service = EmailService()
        with pytest.raises(EmailNotConfiguredError):
            service.send_or_raise(["x@example.com"], "subj", "<p>body</p>")

    def test_raises_value_error_for_empty_recipients(self) -> None:
        service = _configured_service()
        with pytest.raises(ValueError):
            service.send_or_raise([], "subj", "<p>body</p>")

    def test_raises_email_send_error_on_smtp_exception(self) -> None:
        service = _configured_service()
        with patch("smtplib.SMTP", side_effect=OSError("connection refused")):
            with pytest.raises(EmailSendError) as exc:
                service.send_or_raise(["x@example.com"], "subj", "<p>body</p>")
        assert "connection refused" in str(exc.value)

    def test_chains_underlying_exception(self) -> None:
        """The original SMTP exception should be preserved as __cause__ for
        Sentry diagnostics."""
        service = _configured_service()
        underlying = OSError("network down")
        with patch("smtplib.SMTP", side_effect=underlying):
            with pytest.raises(EmailSendError) as exc:
                service.send_or_raise(["x@example.com"], "subj", "<p>body</p>")
        assert exc.value.__cause__ is underlying

    def test_returns_none_on_success(self) -> None:
        service = _configured_service()
        mock_server = MagicMock()

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            result = service.send_or_raise(["x@example.com"], "subj", "<p>body</p>")

        assert result is None  # explicit no-return on success

    def test_inheritance(self) -> None:
        assert issubclass(EmailNotConfiguredError, RuntimeError)
        assert issubclass(EmailSendError, RuntimeError)


class TestSendDelegatesToSendOrRaise:
    """send() should swallow failures from send_or_raise() and return False."""

    def test_send_swallows_email_not_configured(self) -> None:
        service = EmailService()
        # is_configured() returns False, so send_or_raise raises
        # EmailNotConfiguredError, send() returns False.
        assert service.send(["x@example.com"], "subj", "<p>body</p>") is False

    def test_send_swallows_send_error(self) -> None:
        service = _configured_service()
        with patch("smtplib.SMTP", side_effect=OSError("network")):
            assert service.send(["x@example.com"], "subj", "<p>body</p>") is False


class TestAttachments:
    """Attachments support: PDFs, images, and generic binary parts.

    The shared service builds a ``multipart/mixed`` envelope when any
    attachments are passed; without attachments it stays
    ``multipart/alternative`` (the historical wire shape).
    """

    def test_no_attachments_keeps_alternative_envelope(self) -> None:
        service = _configured_service()
        mock_server = MagicMock()
        captured: list[str] = []
        mock_server.sendmail.side_effect = (
            lambda from_addr, to, raw: captured.append(raw)
        )

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            service.send_or_raise(
                ["x@example.com"], "subj", "<p>body</p>",
            )

        assert len(captured) == 1
        assert "Content-Type: multipart/alternative" in captured[0]

    def test_attachments_use_mixed_envelope(self) -> None:
        from platform_shared.services.email_attachment import EmailAttachment

        service = _configured_service()
        mock_server = MagicMock()
        captured: list[str] = []
        mock_server.sendmail.side_effect = (
            lambda from_addr, to, raw: captured.append(raw)
        )

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            service.send_or_raise(
                ["x@example.com"], "subj", "<p>body</p>",
                attachments=[
                    EmailAttachment(
                        filename="lease.pdf",
                        content=b"%PDF-1.4 fake",
                        content_type="application/pdf",
                    ),
                ],
            )

        assert len(captured) == 1
        raw = captured[0]
        # Outer envelope is mixed, inner alternative wraps the body.
        assert "Content-Type: multipart/mixed" in raw
        assert "Content-Type: multipart/alternative" in raw
        # Attachment landed with the right Content-Disposition + filename.
        assert "Content-Disposition: attachment" in raw
        assert "lease.pdf" in raw

    def test_image_attachment_uses_image_subtype(self) -> None:
        from platform_shared.services.email_attachment import EmailAttachment

        service = _configured_service()
        mock_server = MagicMock()
        captured: list[str] = []
        mock_server.sendmail.side_effect = (
            lambda from_addr, to, raw: captured.append(raw)
        )

        # 1x1 PNG header bytes — minimal valid image.
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        )

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            service.send_or_raise(
                ["x@example.com"], "subj", "<p>body</p>",
                attachments=[
                    EmailAttachment(
                        filename="photo.png",
                        content=png_bytes,
                        content_type="image/png",
                    ),
                ],
            )

        assert len(captured) == 1
        raw = captured[0]
        assert "Content-Type: image/png" in raw
        assert "photo.png" in raw

    def test_send_best_effort_passes_attachments_through(self) -> None:
        from platform_shared.services.email_attachment import EmailAttachment

        service = _configured_service()
        mock_server = MagicMock()
        captured: list[str] = []
        mock_server.sendmail.side_effect = (
            lambda from_addr, to, raw: captured.append(raw)
        )

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            ok = service.send(
                ["x@example.com"], "subj", "<p>body</p>",
                attachments=[
                    EmailAttachment(
                        filename="x.pdf", content=b"%PDF",
                        content_type="application/pdf",
                    ),
                ],
            )

        assert ok is True
        assert "lease" in captured[0] or "x.pdf" in captured[0]
