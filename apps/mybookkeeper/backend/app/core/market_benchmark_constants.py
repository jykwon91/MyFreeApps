"""Constants for comparing a recorded plan against the going market rate.

The renewal alert in ``utility_plan_constants`` answers "is my term about to
lapse?". It says nothing about the case that costs more money in practice: a
term that is nowhere near lapsing but was signed at a price the market has
since moved well below. A plan can be perfectly *current* and still be the most
expensive thing in the portfolio.

Flagging that needs exactly two numbers — what the plan charges and what the
market charges. Everything else (early-termination fees, bill credits, exact
usage) belongs to the *decision* to switch, not to the flag that there is a
decision worth making. Keeping the trigger cheap is deliberate: a flag that
demanded a complete cost model would never fire, because the model would never
be complete.

``BENCHMARK_STATUSES`` is mirrored as a TypeScript union in
``frontend/src/shared/types/utility/utility-plan-benchmark-status.ts`` — a value
added here MUST be added there in the same PR.
"""
from app.core.utility_plan_constants import SERVICE_TYPE_INTERNET

# Services priced as a flat monthly amount rather than per unit consumed.
#
# This is the single source of truth for which of a benchmark's two shapes a
# service type must be recorded in: a flat service uses ``monthly_cents``,
# everything else uses ``rate_cents_per_kwh``. Both sides of the comparison
# derive the rule from here, and it is enforced in the request layer, the
# service layer and a DB CHECK — a benchmark recorded in the wrong shape would
# not fail, it would compare a monthly dollar amount against a per-kWh rate and
# report a confidently wrong verdict.
FLAT_RATE_SERVICE_TYPES: frozenset[str] = frozenset({SERVICE_TYPE_INTERNET})


def is_flat_rate_service(service_type: str) -> bool:
    """True when ``service_type`` is benchmarked as a monthly amount."""
    return service_type in FLAT_RATE_SERVICE_TYPES


# Outcome of comparing one plan against the benchmark for its service type.
#   no_benchmark   — nothing recorded to compare against; the operator has not
#                    told us what the market looks like yet
#   not_comparable — a benchmark exists but this plan lacks the figure it would
#                    be measured on (no advertised rate, or a regulated service
#                    with no competing supplier to switch to)
#   at_or_below    — the plan is at or under the market, within tolerance
#   above          — the plan is materially above the market; worth shopping
BENCHMARK_STATUS_NO_BENCHMARK = "no_benchmark"
BENCHMARK_STATUS_NOT_COMPARABLE = "not_comparable"
BENCHMARK_STATUS_AT_OR_BELOW = "at_or_below_market"
BENCHMARK_STATUS_ABOVE = "above_market"

BENCHMARK_STATUSES: frozenset[str] = frozenset({
    BENCHMARK_STATUS_NO_BENCHMARK,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    BENCHMARK_STATUS_ABOVE,
})

# How far above the benchmark a plan must sit before it is worth surfacing.
#
# Not zero. A benchmark is one observation of a moving market, recorded by hand
# on some particular day, and the plan's own figure is an advertised average at
# an assumed usage level. Two numbers that imprecise will differ by a percent or
# two in normal operation, and a badge that lights up for a 1% gap is a badge
# the operator learns to ignore. 10% is wide enough to clear that noise and
# still narrow enough to catch a real gap early — at Houston electricity rates
# it is roughly a cent per kWh.
MATERIAL_GAP_PCT = 10.0

# How long a recorded benchmark is treated as describing the current market.
#
# Retail energy offers reprice constantly; an observation from last winter says
# nothing useful about this summer. Past this age the comparison is still shown
# but is labelled stale, so a flag is never silently resting on a number nobody
# has revisited. Surfacing staleness beats expiring the benchmark outright,
# which would just make the feature quietly stop working.
BENCHMARK_STALE_AFTER_DAYS = 90
