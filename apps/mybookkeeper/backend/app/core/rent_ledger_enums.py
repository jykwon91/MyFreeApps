"""Canonical string values for the rent-ledger domain.

Per RENTALS_PLAN.md §4.1: status / category columns use ``String(N)`` plus a
``CheckConstraint``, never SQLAlchemy ``Enum``. These tuples are the single
source of truth — referenced from both the SQLAlchemy model
``CheckConstraint``s and the Alembic migration DDL.

Mirrors ``app/core/applicant_enums.py`` for consistency.
"""

# How often a rent obligation recurs. This is the *obligation* cadence and is
# deliberately independent of how often the tenant actually pays — a tenant on
# a monthly schedule who pays weekly is the case this whole domain exists for.
#
# ``monthly`` bills calendar months: rent is due on the 1st, and a tenant who
# moves in mid-month owes a prorated first period. ``weekly`` / ``biweekly``
# tile from ``rent_schedules.start_date`` instead, since there is no calendar
# boundary to align a weekly obligation to. Adding a cadence here means adding
# a branch to ``rent_period_math.natural_bounds`` and a case to its tests.
RENT_CADENCES: tuple[str, ...] = ("monthly", "weekly", "biweekly")

# Number of days in a cadence's period, for the cadences that tile on a fixed
# day count. ``monthly`` is absent — calendar months vary in length and are
# advanced with month arithmetic instead.
RENT_CADENCE_DAYS: dict[str, int] = {"weekly": 7, "biweekly": 14}

# What a charge represents. ``rent`` rows are generated from a schedule; every
# other kind is a one-off the host adds by hand (``schedule_id IS NULL``).
#
# ``deposit`` is included so a host can record a deposit obligation, but note
# that deposit *payments* are excluded from rent allocation — they arrive as
# transactions with category ``security_deposit``, which the allocator skips.
RENT_CHARGE_TYPES: tuple[str, ...] = (
    "rent",
    "late_fee",
    "utility_reimbursement",
    "deposit",
    "other",
)

# Derived per-charge settlement state. Never stored — computed by the FIFO
# allocator on read, because it is a pure function of (charges, payments) and
# storing it would go stale the moment a payment is edited or deleted.
RENT_CHARGE_STATUSES: tuple[str, ...] = (
    "paid",
    "partial",
    "open",
    "overdue",
    "waived",
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


RENT_CADENCES_SQL = _sql_in_list(RENT_CADENCES)
RENT_CHARGE_TYPES_SQL = _sql_in_list(RENT_CHARGE_TYPES)
