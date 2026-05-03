"""Tests for platform_shared.services.email_service.

Covers the STARTTLS hardening fix (CWE-327): starttls() must be called with
an explicit ssl.SSLContext rather than no-arg (which is vulnerable to
STARTTLS stripping by a MITM that can downgrade the connection before the
upgrade handshake).
"""
import ssl
from unittest.mock import MagicMock, patch

import pytest

from platform_shared.services.email_service import EmailService


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
