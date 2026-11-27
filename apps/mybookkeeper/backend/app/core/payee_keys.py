"""Who a payment went to, as Monthly expenses shows it, and the key a
remembered payee (``loan_payees``) is matched on."""
from __future__ import annotations

from app.core.monthly_expense_constants import PAYEE_PREFIXES, UNKNOWN_PAYEE


def payee_name(vendor: str | None, description: str | None) -> str:
    """The merchant, or the person a payment app sent money to."""
    name = (vendor or description or "").strip()
    folded = name.casefold()
    for prefix in PAYEE_PREFIXES:
        if folded.startswith(prefix) and len(name) > len(prefix):
            return name[len(prefix):].strip()
    return name or UNKNOWN_PAYEE


def normalized_payee(name: str) -> str:
    """Case-folded, whitespace collapsed. Empty for a blank name."""
    return " ".join(name.split()).casefold()


def payee_key(vendor: str | None, description: str | None) -> str | None:
    """What a payment is matched against remembered payees on; None when it
    names nobody."""
    name = (vendor or description or "").strip()
    return normalized_payee(payee_name(vendor, description)) if name else None
