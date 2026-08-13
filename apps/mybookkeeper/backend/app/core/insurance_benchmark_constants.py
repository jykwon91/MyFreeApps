"""Constants for comparing a recorded policy against the going market premium.

The insurance sibling of ``market_benchmark_constants``. Same question — "am I
paying well above what this costs elsewhere?" — asked about a different kind of
product, so the thresholds differ where the product does and are shared where it
does not.

The comparable unit is **annual premium per $1,000 of dwelling coverage**, never
raw premium. Two policies both costing $1,400 a year are not the same deal if
one covers a $250,000 dwelling and the other a $500,000 one; the second buys
twice the protection for the same money. Raw dollars would call them equal.
Normalising also makes an operator's policy comparable against a county average
assembled from homes of a different size, which is the only kind of benchmark
that exists for this market.

``BENCHMARK_STATUSES`` is mirrored as a TypeScript union in
``frontend/src/shared/types/insurance/insurance-benchmark-status.ts`` — a value
added here MUST be added there in the same PR.
"""

# Outcome of comparing one policy against the organization's benchmark.
#   no_benchmark   — nothing recorded to compare against; the operator has not
#                    told us what the market looks like yet
#   not_comparable — a benchmark exists but this policy lacks a figure the
#                    comparison needs (no premium recorded, or no coverage
#                    amount to normalise it against)
#   at_or_below    — the policy is at or under the market, within tolerance
#   above          — the policy is materially above the market; worth shopping
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

# How far above the benchmark a policy must sit before it is worth surfacing.
#
# Wider than the utility feature's 10%. A utility benchmark is one product's
# advertised rate against another's; a homeowners benchmark is a county-level
# average across a whole population of dwellings, and two houses on the same
# street legitimately differ by more than 10% on roof age, claims history and
# distance to a fire station. At 10% this badge would light up for policies that
# are priced perfectly fairly, and a badge that is usually wrong is a badge the
# operator stops reading.
MATERIAL_GAP_PCT = 25.0

# How long a recorded benchmark is treated as describing the current market.
#
# Much longer than the utility feature's 90 days, because the underlying data
# moves on a different clock. Retail energy offers reprice constantly; the
# homeowners figures published by the Texas Department of Insurance are annual,
# and a policy itself only reprices at renewal. A year is roughly one
# publication cycle, so this labels a benchmark stale at about the point a newer
# one exists to replace it.
BENCHMARK_STALE_AFTER_DAYS = 365

# Coverage is normalised to units of $1,000 before the comparison.
#
# ``coverage_amount_cents / 100_000`` converts cents of coverage into $1,000
# units: $500,000 of coverage is 50_000_000 cents, or 500 units.
CENTS_PER_COVERAGE_UNIT = 100_000
