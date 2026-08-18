"""Pure amortisation arithmetic for the refinance comparison.

No I/O, no models, no clock of its own — every function takes what it needs and
returns a number. That is deliberate: this is the module that decides whether
someone is told to go refinance, so it has to be testable against a real
statement without a database.

Money is integer cents. Rates are ``Decimal`` percentages, so 7.125 means
7.125%, matching both the note and the ``mortgages.interest_rate`` column.
"""
from __future__ import annotations

import datetime as _dt
import math
from decimal import Decimal, ROUND_HALF_UP

_MONTHS_PER_YEAR = 12
_PERCENT = Decimal(100)


def monthly_rate(annual_rate_pct: Decimal) -> Decimal:
    """The periodic rate a monthly amortisation actually uses."""
    return annual_rate_pct / _PERCENT / _MONTHS_PER_YEAR


def monthly_payment_cents(
    principal_cents: int, annual_rate_pct: Decimal, term_months: int,
) -> int:
    """Level principal-and-interest payment. Escrow is not part of this.

    Escrow is excluded because taxes and insurance are owed whoever holds the
    note — including them would count money that a refinance cannot save as
    though it were at stake.
    """
    if term_months <= 0:
        raise ValueError("term_months must be positive")
    if principal_cents <= 0:
        return 0

    principal = Decimal(principal_cents)
    rate = monthly_rate(annual_rate_pct)
    if rate == 0:
        payment = principal / Decimal(term_months)
    else:
        growth = (Decimal(1) + rate) ** term_months
        payment = principal * rate * growth / (growth - Decimal(1))

    return int(payment.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def months_between(start: _dt.date, end: _dt.date) -> int:
    """Whole months from ``start`` to ``end``, floored at zero."""
    months = (end.year - start.year) * _MONTHS_PER_YEAR + (
        end.month - start.month
    )
    if end.day < start.day:
        months -= 1
    return max(months, 0)


def term_implied_by_payment(
    principal_cents: int, annual_rate_pct: Decimal, payment_cents: int,
) -> int | None:
    """How many payments are left, backed out of the payment itself.

    A statement states the balance, the rate and the payment but frequently not
    the payoff date. Those three determine the fourth, so the remaining term
    does not have to be asked for.

    Returns ``None`` when the payment does not amortise the balance at all — a
    payment at or below one month's interest never retires the principal, and
    an interest-only or negatively-amortising loan is exactly that case. It is
    a real loan, not a computation to force a number out of.
    """
    if principal_cents <= 0 or payment_cents <= 0:
        return None

    rate = monthly_rate(annual_rate_pct)
    if rate <= 0:
        return math.ceil(principal_cents / payment_cents)

    interest_only = Decimal(principal_cents) * rate
    if Decimal(payment_cents) <= interest_only:
        return None

    # n = -ln(1 - P*i/pmt) / ln(1+i)
    consumed = float(interest_only / Decimal(payment_cents))
    months = -math.log(1 - consumed) / math.log(1 + float(rate))
    return max(1, round(months))


# There is deliberately no lifetime-interest function here. The comparison
# prices the replacement loan over the payments the operator has LEFT, never
# over a fresh thirty years, so total interest moves in lockstep with the
# monthly payment and would only restate it in a larger font. The number is
# worth having the day this feature offers a term change; until then it is a
# figure nobody computes from, and an untested one is worse than none.


def breakeven_months(
    monthly_saving_cents: int, closing_cost_cents: int,
) -> int | None:
    """How long the lower payment takes to repay what the refinance costs.

    ``None`` when the payment does not fall — there is nothing to pay the cost
    back with, and a breakeven of "never" must not round to a large number that
    reads like a long wait.
    """
    if monthly_saving_cents <= 0:
        return None
    return math.ceil(closing_cost_cents / monthly_saving_cents)
