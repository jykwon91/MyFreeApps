"""Canonical string values for the Mortgage domain.

Per project convention (RENTALS_PLAN.md §4.1): status / category columns use
``String(N)`` plus a ``CheckConstraint``, never ``SQLAlchemy Enum``. These
tuples are the single source of truth — referenced from both the SQLAlchemy
model ``CheckConstraint``s and the Alembic migration DDL.

``RATE_TYPES`` is mirrored as a TypeScript union in
``frontend/src/shared/types/mortgage/mortgage-rate-type.ts`` — a value added
here MUST be added there in the same PR.
"""

# Whether the rate on the note is locked for the life of the loan.
#
# The distinction is load-bearing rather than descriptive. Freddie Mac's weekly
# survey prices fixed loans, so an adjustable loan has no yardstick in this
# feed at all — its rate already moves on a schedule written into its own note.
# Comparing one to a fixed-rate average would answer a question nobody asked.
RATE_TYPE_FIXED = "fixed"
RATE_TYPE_ARM = "arm"

RATE_TYPES: tuple[str, ...] = (RATE_TYPE_FIXED, RATE_TYPE_ARM)

RATE_TYPES_SQL = "('" + "', '".join(RATE_TYPES) + "')"

# Terms Freddie Mac publishes a weekly average for. A 20- or 10-year loan is a
# real product the operator may well hold; it simply has no series here, which
# is a fact about the survey rather than about the loan.
TERM_MONTHS_30_YEAR = 360
TERM_MONTHS_15_YEAR = 180

BENCHMARKED_TERM_MONTHS: tuple[int, ...] = (
    TERM_MONTHS_30_YEAR,
    TERM_MONTHS_15_YEAR,
)


# What the check concluded for one loan. Mirrored as a TypeScript union in
# ``frontend/src/shared/types/mortgage/mortgage-refi-verdict.ts``.
#
# The four are deliberately not a severity ramp. ``not_checkable`` is an
# ANSWER — an adjustable loan has no fixed-rate yardstick, and saying so is the
# correct result rather than a gap in the data. The insurance feature shipped
# without that distinction and the operator read three handled policies as one
# handled and two skipped.
VERDICT_NOT_CHECKABLE = "not_checkable"

# The market, adjusted for how the property is used, is not meaningfully below
# the note. The common case, and the one worth being unambiguous about: doing
# nothing is the right move.
VERDICT_NO_ACTION = "no_action"

# The rate gap is real but the closing costs take longer than the ceiling to
# earn back, or the gap only exists at the optimistic end of the band. Worth
# knowing, not worth an instruction.
VERDICT_MARGINAL = "marginal"

# Materially above market AND the costs pay back inside the ceiling. The only
# state that produces a "go get quotes" instruction.
VERDICT_WORTH_PRICING = "worth_pricing"

REFI_VERDICTS: tuple[str, ...] = (
    VERDICT_NOT_CHECKABLE,
    VERDICT_NO_ACTION,
    VERDICT_MARGINAL,
    VERDICT_WORTH_PRICING,
)
