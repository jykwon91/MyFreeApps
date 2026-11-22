"""An email address cut down to the part safe to log: its domain."""
from __future__ import annotations

MASKED_EMAIL_UNKNOWN = "***"


def mask_email(address: str) -> str:
    """``"***@example.com"`` for ``"bob@example.com"``; ``"***"`` if there is no domain.

    Never raises and never returns any of the local part.
    """
    domain = address.rpartition("@")[2].strip().lower() if "@" in address else ""
    return f"***@{domain}" if domain else MASKED_EMAIL_UNKNOWN


__all__ = ["MASKED_EMAIL_UNKNOWN", "mask_email"]
