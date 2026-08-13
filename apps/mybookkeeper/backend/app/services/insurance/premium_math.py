"""Turn a billed premium into the figure two policies can be compared on.

Pure functions, no I/O. A premium is stored exactly as the declarations page
states it — $1,240 annually, or $112 monthly — so nothing here mutates a record;
it derives the annual equivalent on read.

Annualising is the whole point. A monthly premium beside an annual one differs
by 12x, and comparing the raw amounts would rank the more expensive policy as
the cheaper one.
"""
from __future__ import annotations

from app.core.insurance_enums import PREMIUM_PAYMENTS_PER_YEAR


def annual_premium_cents(
    premium_cents: int | None, premium_frequency: str | None,
) -> int | None:
    """The premium restated as a yearly total, or None when unrecorded.

    Returns None for an unknown frequency rather than guessing at "annual": a
    wrong annualisation is indistinguishable from a real price difference once
    it reaches a comparison, whereas a missing one shows as missing.
    """
    if premium_cents is None or premium_frequency is None:
        return None
    payments = PREMIUM_PAYMENTS_PER_YEAR.get(premium_frequency)
    if payments is None:
        return None
    return premium_cents * payments
