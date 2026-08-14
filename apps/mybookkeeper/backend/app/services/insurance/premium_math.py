"""Turn a billed premium into the figure two policies can be compared on.

Pure functions, no I/O. A premium is stored exactly as the declarations page
states it — $1,240 annually, or $112 monthly — so nothing here mutates a record;
it derives the annual equivalent on read.

Annualising is the whole point. A monthly premium beside an annual one differs
by 12x, and comparing the raw amounts would rank the more expensive policy as
the cheaper one.

Two annual figures come out of here, and which one a caller wants depends on
the question it is asking. A comparison — against a benchmark, a county
average, a competing quote — wants ``annual_premium_cents``, because those are
all premiums. Anything describing what the operator pays wants
``annual_total_cents``. Mixing them up is a quiet 15% error on a surplus-lines
policy, in whichever direction the mix-up ran.
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


def annual_total_cents(
    premium_cents: int | None,
    premium_frequency: str | None,
    fees_and_taxes_cents: int | None,
) -> int | None:
    """A year of premium plus the term's fees and taxes — the cash number.

    The counterpart to :func:`annual_premium_cents`, and the two are not
    interchangeable. The premium is what the coverage costs and is the only half
    comparable to a benchmark or a competing quote; this is what actually leaves
    the operator's account, and on a surplus-lines policy the gap between them
    runs to 15%.

    Fees are added once rather than annualised. They are levied per policy
    term — a policy fee, an inspection fee, a state surplus lines tax — and a
    monthly pay plan does not incur them twelve times. That reading holds for
    the annual terms this domain is made of; a genuinely semiannual term would
    renew its fees mid-year and this would undercount, which is why the fee
    column is documented as per-term rather than per-period.

    Returns None whenever the premium itself is unknown: fees alone are not a
    cost of insurance, and reporting them as one would show a policy with no
    recorded premium as costing exactly its paperwork.
    """
    annual = annual_premium_cents(premium_cents, premium_frequency)
    if annual is None:
        return None
    return annual + (fees_and_taxes_cents or 0)
