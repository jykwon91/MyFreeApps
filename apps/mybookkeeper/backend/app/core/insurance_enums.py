"""Canonical string values for the Insurance domain.

Per project convention (RENTALS_PLAN.md §4.1): status / category columns use
``String(N)`` plus a ``CheckConstraint``, never ``SQLAlchemy Enum``. These
tuples are the single source of truth — referenced from both the SQLAlchemy
model ``CheckConstraint``s and the Alembic migration DDL.

``PREMIUM_FREQUENCIES`` is mirrored as a TypeScript union in
``frontend/src/shared/types/insurance/insurance-premium-frequency.ts`` — a value
added here MUST be added there in the same PR.
"""

# File kinds for insurance policy attachments.
INSURANCE_ATTACHMENT_KINDS: tuple[str, ...] = (
    "policy_document",
    "endorsement",
    "binder",
    "other",
)

# How often the premium is billed. Carriers quote the same policy annually,
# semi-annually or monthly depending on the payment plan chosen, and a monthly
# figure sitting next to an annual one silently understates cost by 12x — so
# the amount is never stored without the period it covers.
PREMIUM_FREQUENCY_ANNUAL = "annual"
PREMIUM_FREQUENCY_SEMIANNUAL = "semiannual"
PREMIUM_FREQUENCY_QUARTERLY = "quarterly"
PREMIUM_FREQUENCY_MONTHLY = "monthly"

PREMIUM_FREQUENCIES: tuple[str, ...] = (
    PREMIUM_FREQUENCY_ANNUAL,
    PREMIUM_FREQUENCY_SEMIANNUAL,
    PREMIUM_FREQUENCY_QUARTERLY,
    PREMIUM_FREQUENCY_MONTHLY,
)

# Billing periods per year. Used to annualise a premium into the one figure two
# policies can be compared on — see ``services/insurance/premium_math.py``.
PREMIUM_PAYMENTS_PER_YEAR: dict[str, int] = {
    PREMIUM_FREQUENCY_ANNUAL: 1,
    PREMIUM_FREQUENCY_SEMIANNUAL: 2,
    PREMIUM_FREQUENCY_QUARTERLY: 4,
    PREMIUM_FREQUENCY_MONTHLY: 12,
}


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


INSURANCE_ATTACHMENT_KINDS_SQL = _sql_in_list(INSURANCE_ATTACHMENT_KINDS)
PREMIUM_FREQUENCIES_SQL = _sql_in_list(PREMIUM_FREQUENCIES)
