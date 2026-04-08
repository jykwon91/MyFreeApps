"""Tests for organization invite email template and sender."""
from unittest.mock import patch

from app.services.organization.invite_email import _build_invite_html, send_invite_email


class TestBuildInviteHtml:
    def test_contains_org_name(self) -> None:
        html = _build_invite_html(
            org_name="Acme Corp",
            org_role="admin",
            inviter_name="Jane Doe",
            accept_url="https://app.example.com/invite/abc123",
        )
        assert "Acme Corp" in html

    def test_contains_role(self) -> None:
        html = _build_invite_html(
            org_name="Acme Corp",
            org_role="user",
            inviter_name="Jane Doe",
            accept_url="https://app.example.com/invite/abc123",
        )
        assert "User" in html

    def test_contains_inviter_name(self) -> None:
        html = _build_invite_html(
            org_name="Acme Corp",
            org_role="admin",
            inviter_name="Jane Doe",
            accept_url="https://app.example.com/invite/abc123",
        )
        assert "Jane Doe" in html

    def test_contains_accept_url(self) -> None:
        html = _build_invite_html(
            org_name="Acme Corp",
            org_role="admin",
            inviter_name="Jane Doe",
            accept_url="https://app.example.com/invite/abc123",
        )
        assert "https://app.example.com/invite/abc123" in html

    def test_escapes_html_in_org_name(self) -> None:
        html = _build_invite_html(
            org_name="<script>alert('xss')</script>",
            org_role="admin",
            inviter_name="Jane",
            accept_url="https://example.com/invite/tok",
        )
        assert "<script>" not in html
        assert "&lt;script&gt;" in html

    def test_contains_expiration_notice(self) -> None:
        html = _build_invite_html(
            org_name="Acme",
            org_role="user",
            inviter_name="Jane",
            accept_url="https://example.com/invite/tok",
        )
        assert "7 days" in html

    def test_contains_accept_button(self) -> None:
        html = _build_invite_html(
            org_name="Acme",
            org_role="user",
            inviter_name="Jane",
            accept_url="https://example.com/invite/tok",
        )
        assert "Accept Invite" in html


class TestSendInviteEmail:
    @patch("app.services.organization.invite_email.email_service")
    @patch("app.services.organization.invite_email.settings")
    def test_constructs_accept_url_from_frontend_url(
        self, mock_settings, mock_email_svc
    ) -> None:
        mock_settings.frontend_url = "https://mybookkeeper.app"
        mock_email_svc.send_email.return_value = True

        result = send_invite_email(
            recipient_email="user@example.com",
            org_name="Test Org",
            org_role="admin",
            inviter_name="Inviter",
            invite_token="test-token-123",
        )

        assert result is True
        call_args = mock_email_svc.send_email.call_args
        html_body = call_args[0][2]
        assert "https://mybookkeeper.app/invite/test-token-123" in html_body

    @patch("app.services.organization.invite_email.email_service")
    @patch("app.services.organization.invite_email.settings")
    def test_returns_false_when_email_fails(
        self, mock_settings, mock_email_svc
    ) -> None:
        mock_settings.frontend_url = "https://mybookkeeper.app"
        mock_email_svc.send_email.return_value = False

        result = send_invite_email(
            recipient_email="user@example.com",
            org_name="Test Org",
            org_role="user",
            inviter_name="Inviter",
            invite_token="tok",
        )

        assert result is False

    @patch("app.services.organization.invite_email.email_service")
    @patch("app.services.organization.invite_email.settings")
    def test_subject_includes_org_name(
        self, mock_settings, mock_email_svc
    ) -> None:
        mock_settings.frontend_url = "https://example.com"
        mock_email_svc.send_email.return_value = True

        send_invite_email(
            recipient_email="user@example.com",
            org_name="My Workspace",
            org_role="admin",
            inviter_name="Inviter",
            invite_token="tok",
        )

        call_args = mock_email_svc.send_email.call_args
        subject = call_args[0][1]
        assert "My Workspace" in subject

    @patch("app.services.organization.invite_email.email_service")
    @patch("app.services.organization.invite_email.settings")
    def test_strips_trailing_slash_from_frontend_url(
        self, mock_settings, mock_email_svc
    ) -> None:
        mock_settings.frontend_url = "https://mybookkeeper.app/"
        mock_email_svc.send_email.return_value = True

        send_invite_email(
            recipient_email="user@example.com",
            org_name="Test",
            org_role="user",
            inviter_name="Inviter",
            invite_token="my-token",
        )

        call_args = mock_email_svc.send_email.call_args
        html_body = call_args[0][2]
        assert "https://mybookkeeper.app/invite/my-token" in html_body
        assert "https://mybookkeeper.app//invite" not in html_body
