"""Tests for the shared email-template builders."""
from platform_shared.services.email_templates import (
    Branding,
    build_password_reset_html,
    build_verification_html,
)

# Two distinct branding fixtures so the tests catch any accidental
# hardcoding of one app's colour or copy in the shared template.
_MBK_BRANDING = Branding(
    app_name="MyBookkeeper",
    accent_color="#22c55e",
    tagline="Your AI-powered bookkeeping assistant",
    header_prefix_html="&#x1F4D2; ",
    footer_suffix="AI-powered bookkeeping",
)
_MJH_BRANDING = Branding(
    app_name="MyJobHunter",
    accent_color="#2563eb",
    tagline="Your AI-powered job search assistant",
)


# ---------------------------------------------------------------------------
# Verification template
# ---------------------------------------------------------------------------

class TestBuildVerificationHtml:
    def test_includes_verify_url(self):
        html = build_verification_html(
            verify_url="https://example.com/verify-email?token=abc123",
            branding=_MBK_BRANDING,
        )
        assert "https://example.com/verify-email?token=abc123" in html

    def test_escapes_url(self):
        html = build_verification_html(
            verify_url="https://example.com/verify?token=a<b>c",
            branding=_MBK_BRANDING,
        )
        assert "<b>" not in html
        assert "&lt;b&gt;" in html

    def test_includes_brand_name(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "MyBookkeeper" in html

    def test_uses_brand_color(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "#22c55e" in html

    def test_includes_tagline(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "Your AI-powered bookkeeping assistant" in html

    def test_includes_header_prefix_html_unescaped(self):
        """``header_prefix_html`` is inserted verbatim so callers can use entities."""
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "&#x1F4D2;" in html

    def test_includes_footer_suffix(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "AI-powered bookkeeping" in html

    def test_includes_verify_button(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "Verify my email" in html

    def test_includes_expiry_notice(self):
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "expires" in html.lower()

    def test_supports_branding_without_prefix_or_suffix(self):
        """MJH-shape branding has empty prefix/suffix — output stays valid."""
        html = build_verification_html(
            verify_url="https://example.com",
            branding=_MJH_BRANDING,
        )
        assert "MyJobHunter" in html
        assert "#2563eb" in html
        # Footer should be just the brand name without bullet separator
        assert "Sent by MyJobHunter" in html
        assert "MyJobHunter &bull;" not in html

    def test_escapes_brand_name(self):
        """Defence-in-depth: a brand name with HTML chars stays safe."""
        evil = Branding(
            app_name="<script>",
            accent_color="#000",
            tagline="<x>",
        )
        html = build_verification_html(
            verify_url="https://example.com",
            branding=evil,
        )
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


# ---------------------------------------------------------------------------
# Password-reset template
# ---------------------------------------------------------------------------

class TestBuildPasswordResetHtml:
    def test_includes_reset_url(self):
        html = build_password_reset_html(
            reset_url="https://example.com/reset-password?token=abc123",
            branding=_MBK_BRANDING,
        )
        assert "https://example.com/reset-password?token=abc123" in html

    def test_escapes_url(self):
        html = build_password_reset_html(
            reset_url="https://example.com/reset?token=a<b>c",
            branding=_MBK_BRANDING,
        )
        assert "<b>" not in html
        assert "&lt;b&gt;" in html

    def test_includes_brand_name(self):
        html = build_password_reset_html(
            reset_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "MyBookkeeper" in html

    def test_uses_brand_color(self):
        html = build_password_reset_html(
            reset_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "#22c55e" in html

    def test_includes_reset_button(self):
        html = build_password_reset_html(
            reset_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "Reset Password" in html

    def test_includes_expiry_notice(self):
        html = build_password_reset_html(
            reset_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "expires" in html.lower()

    def test_includes_did_not_request_safe_to_ignore(self):
        html = build_password_reset_html(
            reset_url="https://example.com",
            branding=_MBK_BRANDING,
        )
        assert "didn't request" in html
