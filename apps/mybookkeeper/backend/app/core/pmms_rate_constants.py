"""Configuration for the Freddie Mac mortgage-rate check.

The upstream is the Primary Mortgage Market Survey, republished by FRED as a
keyless CSV. It gives the average rate lenders quoted nationally in a given
week — a rate LEVEL, unlike the Texas insurance feed's rate CHANGES.

Everything here that turns that national average into something comparable to
the operator's own loan is the part worth reading carefully. Getting it wrong
is not a cosmetic bug: it tells someone to go refinance a loan they cannot
actually beat, which costs them an application, a credit pull and an
afternoon.
"""

# FRED's graph-export endpoint. No API key, no account, no rate limit
# published — the same reason the Texas filing feed was chosen over a
# commercial one. ``fredgraph.csv`` rather than ``api.stlouisfed.org``: the
# JSON API 400s without a registered key, and a key is one more secret to
# provision on the VPS for data that is public either way.
PMMS_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# Freddie Mac's series for the two terms it publishes.
SERIES_30_YEAR = "MORTGAGE30US"
SERIES_15_YEAR = "MORTGAGE15US"

PMMS_SERIES_IDS: tuple[str, ...] = (SERIES_30_YEAR, SERIES_15_YEAR)

# The CSV carries the full history back to 1971 and is ~40KB. Only the newest
# observation is ever used, but the endpoint offers no "latest" mode that
# actually works — the documented ``cosd`` start-date parameter is ignored by
# this export — so the whole series is fetched and the tail is taken.
PMMS_REQUEST_TIMEOUT_SECONDS = 15.0
PMMS_MAX_ATTEMPTS = 3
PMMS_BACKOFF_SECONDS = 1.0

# The survey publishes weekly, on Thursdays. Re-fetching per page view would
# hammer a public good for a number that cannot have changed.
PMMS_CACHE_TTL_SECONDS = 60 * 60 * 6

# An observation this old means the survey stopped publishing or the export
# changed shape. Better to say the data is stale than to compare a live loan
# against a figure from last quarter.
PMMS_MAX_OBSERVATION_AGE_DAYS = 21


# --- Occupancy adjustment -------------------------------------------------
#
# PMMS surveys loans on OWNER-OCCUPIED homes: conforming balance, ~20% down,
# excellent credit, purchase. A loan on a rental is a different product at a
# different price, and the gap is not noise — it is larger than most of the
# rate movements this feature exists to detect.
#
# The size of the gap is set by the agencies' loan-level price adjustments.
# Source, read directly rather than recalled: Fannie Mae's *Loan-Level Price
# Adjustment (LLPA) Matrix*, © 2026, Table 2 (Limited Cash-Out Refinance —
# the rate-and-term case this feature models), "Additional LLPAs by Loan
# Feature", ``Investment property`` row:
#
#     LTV ≤ 60.00%        1.125 price points
#     LTV 60.01 – 70.00%  1.625
#     LTV 70.01 – 75.00%  2.125
#     LTV 75.01 – 80.00%  3.375
#     LTV > 80.00%        4.125
#
# Two things about that table that are easy to get wrong, and were:
#
# 1. ``Second home`` carries the SAME adjustment as ``Investment property``
#    in the current matrix — identical row, value for value. A design that
#    assumes a second home is priced nearer a primary residence produces a
#    confidently wrong verdict on one.
# 2. Those are PRICE points, not rate. A price point is a percent of the loan
#    amount paid at closing; converting to a rate uses the market's
#    price-to-rate tradeoff, conventionally about four price points to one
#    percentage point of rate, and that ratio itself drifts with the coupon
#    stack.
#
# So the honest output is a band, not a figure. A rental refinanced at the
# 60–80% LTV that most carry sits between 1.625 and 3.375 price points, which
# at ~4:1 is roughly 0.4 to 0.85 percentage points of rate.
#
# The band is deliberately not narrowed by credit score or true LTV. Current
# LTV needs a current VALUATION, which this app does not have and should not
# guess from a purchase price that may be years old; asking for a FICO the
# operator may not know to buy two decimal places of false precision is the
# trade this whole module exists to refuse.
LLPA_PRICE_POINTS_PER_RATE_POINT = 4.0

# Keyed by ``PropertyClassification`` value.
OCCUPANCY_RATE_ADDON_PCT: dict[str, tuple[float, float]] = {
    # Investment and second home are identical per the matrix above.
    "investment": (0.40, 0.85),
    "second_home": (0.40, 0.85),
    # PMMS surveys this borrower directly, so the published average already is
    # the comparison. Not zero because it is negligible — zero because it is
    # the population being measured.
    "primary_residence": (0.0, 0.0),
}


# --- Materiality ----------------------------------------------------------

# Below this the gap is inside the noise of the estimate itself and is not
# worth an alert. A tenth of a point of rate cannot survive a band that is
# already 0.45 wide.
MIN_NOTABLE_RATE_DELTA_PCT = 0.375

# Refinancing costs money up front. A gap that takes longer than this to pay
# itself back is not an opportunity, however large the rate difference looks —
# which is exactly the case a rate-only comparison gets wrong.
BREAKEVEN_ALERT_CEILING_MONTHS = 36

# Closing costs as a share of the loan amount. A range because it genuinely is
# one: lender fees, title, appraisal and points vary by lender and by state,
# and a single number here would read as a quote.
CLOSING_COST_LOW_PCT = 2.0
CLOSING_COST_HIGH_PCT = 5.0

# The comparison prices the replacement loan over the payments the operator has
# LEFT, not over a fresh 30-year term. That isolates the rate, which is the
# question being asked; a fresh term would mix in a longer payoff and show a
# saving that is partly just deferral. Lenders quote 30-year products, so the
# UI has to say which of the two it did — see ``remaining_term_months`` on the
# outlook.


# --- Reasons a loan cannot be checked -------------------------------------
#
# Each of these is an ANSWER, not a failed lookup. The insurance feature
# shipped without that distinction and the operator read three handled
# policies as one handled and two skipped.

REASON_ADJUSTABLE_RATE = (
    "This is an adjustable-rate mortgage (ARM) — its rate already moves on a "
    "schedule set in your own loan documents, so Freddie Mac's fixed-rate "
    "weekly average isn't the right yardstick for it."
)

REASON_NO_TERM_RECORDED = (
    "How many payments are left on this loan isn't recorded. Add either the "
    "payoff date or the monthly principal and interest and this will have an "
    "answer — a rate on its own can't be turned into a payment."
)

REASON_PROPERTY_UNCLASSIFIED = (
    "This property isn't marked as an investment property, second home, or "
    "primary residence yet. What a comparable loan costs depends on which it "
    "is, so classify it on the Properties page and this will have an answer."
)

REASON_NO_RATE_RECORDED = (
    "No interest rate recorded on this loan yet. Add it and this will have "
    "something to compare."
)

REASON_NO_BALANCE_RECORDED = (
    "No remaining balance recorded on this loan yet. Without it a rate "
    "difference can't be turned into dollars, which is the only form worth "
    "acting on."
)

REASON_FEED_UNAVAILABLE = (
    "Freddie Mac's weekly rate data could not be reached, so nothing was "
    "checked."
)
