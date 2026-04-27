"""Unit tests for BounceDetector — every signal in isolation plus negatives."""

from pathlib import Path

import pytest

from app.models.email.inbound_email_signals import InboundEmailSignals
from app.services.email.bounce_detector import BounceDetector

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "bounces"


def _signals(
    *,
    from_address: str | None = "Vendor Co <billing@vendor.example>",
    subject: str | None = "Invoice INV-1234",
    headers: dict[str, str] | None = None,
    body_preview: str | None = None,
) -> InboundEmailSignals:
    return InboundEmailSignals(
        from_address=from_address,
        subject=subject,
        headers=headers or {},
        body_preview=body_preview,
    )


class TestFromAddressRule:
    def test_mailer_daemon_lowercase_filters(self) -> None:
        result = BounceDetector().detect(_signals(from_address="mailer-daemon@example.com"))
        assert result.filtered is True
        assert result.reason == "from_address"

    def test_mailer_daemon_uppercase_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(from_address="MAILER-DAEMON@example.com")
        )
        assert result.filtered is True
        assert result.reason == "from_address"

    def test_mailer_daemon_with_display_name_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(from_address="Mail Delivery System <MAILER-DAEMON@example.com>")
        )
        assert result.filtered is True
        assert result.reason == "from_address"

    def test_postmaster_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(from_address="postmaster@bounces.example.com")
        )
        assert result.filtered is True
        assert result.reason == "from_address"

    def test_noreply_alone_does_not_filter(self) -> None:
        # Many legit transactional senders use noreply@. Don't filter unless
        # the subject also matches.
        result = BounceDetector().detect(
            _signals(
                from_address="noreply@vendor.example",
                subject="Your invoice from Vendor Co",
            )
        )
        assert result.filtered is False

    def test_noreply_with_failure_subject_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(
                from_address="noreply@mailer.example",
                subject="Undeliverable: Re: Invoice",
            )
        )
        assert result.filtered is True
        # The subject rule fires first in detector order, but either reason
        # is correct — what matters is the email was filtered.
        assert result.reason in {"from_address", "subject"}

    def test_no_dash_no_reply_with_failure_subject_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(
                from_address="no-reply@mailer.example",
                subject="Mail delivery failed: returning message to sender",
            )
        )
        assert result.filtered is True

    def test_legit_vendor_does_not_filter(self) -> None:
        result = BounceDetector().detect(
            _signals(
                from_address="Acme Plumbing <billing@acmeplumbing.example>",
                subject="Invoice 4567 - Service on April 15",
            )
        )
        assert result.filtered is False
        assert result.reason is None

    def test_missing_from_address_does_not_filter(self) -> None:
        result = BounceDetector().detect(_signals(from_address=None))
        assert result.filtered is False

    def test_malformed_from_address_does_not_filter(self) -> None:
        # No @-sign -> we can't extract a local part -> can't match
        result = BounceDetector().detect(_signals(from_address="just a name no email"))
        assert result.filtered is False


class TestSubjectRule:
    @pytest.mark.parametrize(
        "subject",
        [
            "Mail Delivery Subsystem - delivery failure",
            "MAIL DELIVERY SUBSYSTEM",
            "Undeliverable: Your invoice request",
            "Delivery Status Notification (Failure)",
            "Failure Notice",
            "Returned mail: see transcript for details",
            "Mail delivery failed: returning message to sender",
            "Delivery has failed to these recipients or groups",
        ],
    )
    def test_known_bounce_subjects_filter(self, subject: str) -> None:
        result = BounceDetector().detect(_signals(subject=subject))
        assert result.filtered is True
        assert result.reason == "subject"

    def test_legit_shipping_status_does_not_filter(self) -> None:
        # Edge case from the project rule — "Delivery Status: shipped" is a
        # carrier confirmation, not a bounce. Our needles use "Delivery Status
        # Notification (Failure)" specifically so this should pass.
        result = BounceDetector().detect(
            _signals(
                from_address="Shipping <shipping@store.example>",
                subject="Delivery Status: Your order has shipped",
            )
        )
        assert result.filtered is False

    def test_subject_with_fwd_prefix_does_not_filter_alone(self) -> None:
        # User forwarding a non-bounce email with [Fwd:] prefix should not
        # trip the bounce detector. The keyword list excludes [Fwd:].
        result = BounceDetector().detect(
            _signals(subject="[Fwd: Welcome to our service]"),
        )
        assert result.filtered is False

    def test_empty_subject_does_not_filter(self) -> None:
        result = BounceDetector().detect(_signals(subject=""))
        assert result.filtered is False

    def test_none_subject_does_not_filter(self) -> None:
        result = BounceDetector().detect(_signals(subject=None))
        assert result.filtered is False


class TestHeaderRules:
    def test_x_failed_recipients_header_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"X-Failed-Recipients": "user@example.invalid"}),
        )
        assert result.filtered is True
        assert result.reason == "header_x_failed_recipients"

    def test_x_failed_recipients_header_case_insensitive(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"x-failed-recipients": "user@example.invalid"}),
        )
        assert result.filtered is True
        assert result.reason == "header_x_failed_recipients"

    def test_auto_submitted_auto_replied_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"Auto-Submitted": "auto-replied"}),
        )
        assert result.filtered is True
        assert result.reason == "header_auto_submitted"

    def test_auto_submitted_auto_generated_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"Auto-Submitted": "auto-generated; type=delivery-status"}),
        )
        assert result.filtered is True
        assert result.reason == "header_auto_submitted"

    def test_auto_submitted_no_does_not_filter(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"Auto-Submitted": "no"}),
        )
        assert result.filtered is False

    def test_dsn_content_type_filters(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"Content-Type": 'multipart/report; report-type=delivery-status; boundary="abc"'}),
        )
        assert result.filtered is True
        assert result.reason == "header_dsn"

    def test_partial_dsn_content_type_does_not_filter(self) -> None:
        # multipart/report alone (without report-type=delivery-status) is used
        # by other reports too — we require both markers.
        result = BounceDetector().detect(
            _signals(headers={"Content-Type": 'multipart/report; report-type=disposition-notification'}),
        )
        assert result.filtered is False

    def test_normal_content_type_does_not_filter(self) -> None:
        result = BounceDetector().detect(
            _signals(headers={"Content-Type": "multipart/mixed; boundary=abc"}),
        )
        assert result.filtered is False


class TestBodyFingerprintRule:
    def test_diagnostic_code_in_body_filters(self) -> None:
        body = "some preamble\n\nDiagnostic-Code: smtp; 550 5.1.1 No such user\n"
        result = BounceDetector().detect(_signals(body_preview=body))
        assert result.filtered is True
        assert result.reason == "body_dsn_fingerprint"

    def test_original_recipient_in_body_filters(self) -> None:
        body = "Original-Recipient: rfc822;user@example.invalid\nAction: failed\n"
        result = BounceDetector().detect(_signals(body_preview=body))
        assert result.filtered is True
        assert result.reason == "body_dsn_fingerprint"

    def test_action_failed_in_body_filters(self) -> None:
        body = "Final-Recipient: rfc822; user@example.invalid\nAction: failed\nStatus: 5.1.1"
        result = BounceDetector().detect(_signals(body_preview=body))
        assert result.filtered is True
        assert result.reason == "body_dsn_fingerprint"

    def test_fingerprint_only_in_scan_window(self) -> None:
        # A real invoice that happens to mention "Diagnostic-Code" past the
        # scan window should NOT match — DSN fingerprints only appear in the
        # opening section of the body. The window is 2KB by default to cover
        # bounces with long human preambles.
        padding = "x" * 3000
        body = padding + "Diagnostic-Code: not really"
        result = BounceDetector().detect(_signals(body_preview=body))
        assert result.filtered is False

    def test_legit_invoice_body_does_not_filter(self) -> None:
        body = "Thanks for your business! Your invoice is attached. Total: $123.45"
        result = BounceDetector().detect(_signals(body_preview=body))
        assert result.filtered is False

    def test_empty_body_does_not_filter(self) -> None:
        result = BounceDetector().detect(_signals(body_preview=None))
        assert result.filtered is False


class TestRealWorldFixtures:
    """End-to-end sanity tests against sanitized real-world bounce bodies."""

    def test_postfix_dsn_fixture_filters_via_body(self) -> None:
        body = (FIXTURES_DIR / "postfix_dsn.txt").read_text()
        result = BounceDetector().detect(
            _signals(
                from_address="MAILER-DAEMON@mail.example.com",
                subject="Undeliverable: Re: Invoice attached",
                headers={"Content-Type": "multipart/report; report-type=delivery-status"},
                body_preview=body,
            ),
        )
        assert result.filtered is True

    def test_postfix_body_alone_filters(self) -> None:
        body = (FIXTURES_DIR / "postfix_dsn.txt").read_text()
        # Even with neutral From/subject and no headers, the DSN body
        # fingerprints should still trip the detector.
        result = BounceDetector().detect(
            _signals(
                from_address="someone@example.com",
                subject="re: question",
                headers={},
                body_preview=body,
            ),
        )
        assert result.filtered is True
        assert result.reason == "body_dsn_fingerprint"

    def test_exchange_undeliverable_subject_filters(self) -> None:
        body = (FIXTURES_DIR / "exchange_undeliverable.txt").read_text()
        result = BounceDetector().detect(
            _signals(
                from_address="postmaster@contoso.example",
                subject="Undeliverable: Invoice attached",
                headers={},
                body_preview=body,
            ),
        )
        assert result.filtered is True

    def test_vacation_autoreply_filters_via_header(self) -> None:
        body = (FIXTURES_DIR / "vacation_autoreply.txt").read_text()
        result = BounceDetector().detect(
            _signals(
                from_address="Person <person@example.com>",
                subject="Out of office: Re: Invoice",
                headers={"Auto-Submitted": "auto-replied"},
                body_preview=body,
            ),
        )
        assert result.filtered is True
        assert result.reason == "header_auto_submitted"

    def test_vacation_autoreply_without_header_does_not_filter(self) -> None:
        # If the auto-reply doesn't set the Auto-Submitted header (some
        # clients don't), and the subject is innocuous, we err on the side
        # of letting it through — better than dropping a real invoice.
        body = (FIXTURES_DIR / "vacation_autoreply.txt").read_text()
        result = BounceDetector().detect(
            _signals(
                from_address="Person <person@example.com>",
                subject="Re: question",
                headers={},
                body_preview=body,
            ),
        )
        assert result.filtered is False


class TestRulePrecedence:
    """When multiple signals match, the earliest in detector order wins."""

    def test_x_failed_recipients_takes_precedence_over_subject(self) -> None:
        result = BounceDetector().detect(
            _signals(
                from_address="MAILER-DAEMON@mail.example.com",
                subject="Undeliverable: original message",
                headers={"X-Failed-Recipients": "user@example.invalid"},
            ),
        )
        assert result.filtered is True
        assert result.reason == "header_x_failed_recipients"

    def test_auto_submitted_takes_precedence_over_subject(self) -> None:
        result = BounceDetector().detect(
            _signals(
                subject="Undeliverable: original message",
                headers={"Auto-Submitted": "auto-replied"},
            ),
        )
        assert result.filtered is True
        assert result.reason == "header_auto_submitted"
