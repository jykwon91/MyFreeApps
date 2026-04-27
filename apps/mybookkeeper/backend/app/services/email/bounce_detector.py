"""Detect bounce / auto-reply / DSN emails before Claude extraction.

Purpose:
    Gmail invoice sync occasionally pulls in mailer-daemon failures, vacation
    auto-replies, and RFC 3464 delivery status notifications. None of these
    contain invoice data — sending them to Claude wastes tokens and produces
    spurious transactions. This detector short-circuits the pipeline by
    returning a structured filter decision before any downstream work runs.

Design:
    - Pure logic, no DB / no I/O. Every method takes the email signals and
      returns a verdict so each rule can be unit-tested in isolation.
    - Each rule maps to one BounceReason so the audit log captures exactly
      which signal triggered the filter.
    - Rules run cheapest-first (header lookups before body scans).
"""

from app.models.email.bounce_detection_result import BounceDetectionResult, BounceReason
from app.models.email.inbound_email_signals import InboundEmailSignals
from app.services.email.constants import (
    BOUNCE_BODY_FINGERPRINT_PREFIX_BYTES,
    BOUNCE_BODY_FINGERPRINTS,
    BOUNCE_FROM_LOCAL_PARTS,
    BOUNCE_HEADER_AUTO_SUBMITTED,
    BOUNCE_HEADER_AUTO_SUBMITTED_VALUES,
    BOUNCE_HEADER_CONTENT_TYPE,
    BOUNCE_HEADER_CONTENT_TYPE_DSN_MARKERS,
    BOUNCE_HEADER_X_FAILED_RECIPIENTS,
    BOUNCE_NOREPLY_LOCAL_PARTS,
    BOUNCE_SUBJECT_SUBSTRINGS,
)


class BounceDetector:
    """Stateless bounce-signal detector.

    Usage:
        result = BounceDetector().detect(signals)
        if result.filtered:
            ...skip extraction, log result.reason...
    """

    def detect(self, signals: InboundEmailSignals) -> BounceDetectionResult:
        # Order matters: cheapest checks first. Each method returns a reason
        # if it matched, otherwise None.
        checks: tuple[tuple[BounceReason, bool], ...] = (
            ("header_x_failed_recipients", self._has_x_failed_recipients(signals)),
            ("header_auto_submitted", self._has_auto_submitted(signals)),
            ("header_dsn", self._has_dsn_content_type(signals)),
            ("from_address", self._has_bounce_from(signals)),
            ("subject", self._has_bounce_subject(signals)),
            ("body_dsn_fingerprint", self._has_body_dsn_fingerprint(signals)),
        )
        for reason, matched in checks:
            if matched:
                return BounceDetectionResult(filtered=True, reason=reason)
        return BounceDetectionResult(filtered=False, reason=None)

    # -- Individual rules. Each is independently testable. --

    def _has_x_failed_recipients(self, signals: InboundEmailSignals) -> bool:
        return self._header_value(signals, BOUNCE_HEADER_X_FAILED_RECIPIENTS) is not None

    def _has_auto_submitted(self, signals: InboundEmailSignals) -> bool:
        value = self._header_value(signals, BOUNCE_HEADER_AUTO_SUBMITTED)
        if value is None:
            return False
        # The header value can be a token plus parameters
        # ("auto-replied; foo=bar"). We only care about the leading token.
        leading_token = value.split(";", 1)[0].strip().lower()
        return leading_token in BOUNCE_HEADER_AUTO_SUBMITTED_VALUES

    def _has_dsn_content_type(self, signals: InboundEmailSignals) -> bool:
        value = self._header_value(signals, BOUNCE_HEADER_CONTENT_TYPE)
        if value is None:
            return False
        lowered = value.lower()
        return all(marker in lowered for marker in BOUNCE_HEADER_CONTENT_TYPE_DSN_MARKERS)

    def _has_bounce_from(self, signals: InboundEmailSignals) -> bool:
        local_part = self._from_local_part(signals.from_address)
        if local_part is None:
            return False
        if local_part in BOUNCE_FROM_LOCAL_PARTS:
            return True
        # noreply alone is too broad — require a delivery-failure subject too.
        if local_part in BOUNCE_NOREPLY_LOCAL_PARTS and self._has_bounce_subject(signals):
            return True
        return False

    def _has_bounce_subject(self, signals: InboundEmailSignals) -> bool:
        if not signals.subject:
            return False
        subject = signals.subject.lower()
        return any(needle in subject for needle in BOUNCE_SUBJECT_SUBSTRINGS)

    def _has_body_dsn_fingerprint(self, signals: InboundEmailSignals) -> bool:
        if not signals.body_preview:
            return False
        prefix = signals.body_preview[:BOUNCE_BODY_FINGERPRINT_PREFIX_BYTES].lower()
        return any(needle in prefix for needle in BOUNCE_BODY_FINGERPRINTS)

    # -- Helpers --

    @staticmethod
    def _header_value(signals: InboundEmailSignals, name: str) -> str | None:
        # Email header names are case-insensitive (RFC 5322), but we still
        # normalize defensively so callers passing odd casing don't slip through.
        target = name.lower()
        for key, value in signals.headers.items():
            if key.lower() == target:
                return value
        return None

    @staticmethod
    def _from_local_part(from_address: str | None) -> str | None:
        if not from_address:
            return None
        # Gmail's From header is typically "Display Name <user@host>". Pull
        # out the address-token between '<' and '>' if present, else use the
        # whole string.
        token = from_address.strip()
        if "<" in token and ">" in token:
            start = token.index("<") + 1
            end = token.index(">", start)
            token = token[start:end]
        if "@" not in token:
            return None
        return token.split("@", 1)[0].strip().lower()
