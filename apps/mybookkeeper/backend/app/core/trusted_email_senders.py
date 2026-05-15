"""Allowlist of sender domains whose email-body extractions can be auto-approved.

Email-body extractions normally land as ``unverified`` so the user reviews
them before they affect dashboard totals. For payment platforms whose
emails are unambiguous structured receipts (Airbnb, Zelle, VRBO, etc.),
that review step is friction without value — the sender domain is itself
strong evidence the transaction is real.
"""
from __future__ import annotations

TRUSTED_PAYMENT_SENDERS: frozenset[str] = frozenset({
    "airbnb.com",
    "zellepay.com",
    "vrbo.com",
    "booking.com",
    "vello.app",
    "furnishedfinder.com",
})


def _extract_domain(email: str) -> str | None:
    """Return the lowercase domain portion of ``email`` or None."""
    if "@" not in email:
        return None
    _, _, domain = email.rpartition("@")
    domain = domain.strip().lower()
    # Strip a trailing display-name angle bracket if present.
    if domain.endswith(">"):
        domain = domain[:-1].strip()
    return domain or None


def is_trusted_sender(email: str | None) -> bool:
    """Return True if ``email`` is from a trusted payment sender domain.

    Matches the domain exactly or as a subdomain (``noreply@auto.airbnb.com``
    matches the ``airbnb.com`` entry).
    """
    if not email:
        return False
    domain = _extract_domain(email)
    if not domain:
        return False
    for trusted in TRUSTED_PAYMENT_SENDERS:
        if domain == trusted or domain.endswith("." + trusted):
            return True
    return False
