"""Constants for the Power to Choose offer feed.

Power to Choose (powertochoose.org) is the electricity marketplace the Public
Utility Commission of Texas runs. Every REP selling to residential customers in
the deregulated market is required to list its offers there, so the feed is the
closest thing to a complete, neutral view of what a Texas address can actually
buy. It is public, unauthenticated, and free.

Only *electricity* is shoppable. Houston natural gas is a regulated CenterPoint
monopoly and water is municipal — there is no competing supplier to switch to,
which is why ``REGULATED_TX_GAS_PROVIDERS`` exists in
``utility_plan_constants``. Asking this feed about gas would return nothing.
"""

# Undocumented but long-stable JSON endpoint behind the public site. Plain HTTP
# is what the host serves; it carries no credentials and no personal data — the
# only thing sent is a ZIP code.
POWER_TO_CHOOSE_PLANS_URL = "http://api.powertochoose.org/api/PowerToChoose/plans"

# The feed returns ~175 offers for a Houston ZIP in well under a second. 15s is
# generous enough to absorb a slow day without holding a request open.
OFFER_FETCH_TIMEOUT_SECONDS: float = 15.0

# Offers are re-published in daily batches, so a short in-process cache spares
# the PUCT host a request per page view without ever showing a stale price.
OFFER_CACHE_TTL_SECONDS: int = 900

# ``rate_type`` values the feed emits. Only ``Fixed`` has a price that holds for
# the term; ``Variable`` is the holdover product a lapsed plan already fell
# into, so offering it as an upgrade would be nonsense.
FEED_RATE_TYPE_FIXED = "Fixed"

# Shortest term worth switching for. Anything under a year re-exposes the
# operator to the same renewal cliff before the switch has paid for itself.
DEFAULT_MIN_TERM_MONTHS = 12

# Reference annual consumption for the savings estimate, in kWh. Texas EFLs
# quote price at 500 / 1000 / 2000 kWh per month, and 1000 is the disclosure
# point every plan must publish — so 12,000 kWh/yr is the only basis on which
# two arbitrary plans can be compared without per-property usage history.
# Savings computed from it are explicitly a "at this reference usage" figure,
# never a promise about a specific bill.
REFERENCE_ANNUAL_KWH = 12_000

# A plan is teaser-priced when its headline 1000 kWh figure is far below what
# the same plan charges at 500 and 2000 kWh. That shape is the signature of a
# bill credit that pays out only inside a narrow usage band: land one kWh
# outside it and the effective rate can double. As of this writing 9 of the 174
# Houston offers do this, and they occupy the entire top of a naive
# sort-by-price-at-1000 — which is exactly why this threshold exists.
TEASER_PRICE_RATIO = 0.85

# Gap below which a switch is not worth the paperwork, in ¢/kWh. Under a cent
# the annual difference is inside the noise of a usage swing.
MIN_MEANINGFUL_SAVING_CENTS = 1.0

# Lowest Power to Choose customer rating (1-5) an offer may carry and still be
# recommended. The cheapest honest Houston offers are 1-star providers, and a
# rock-bottom rate from a REP with a billing-dispute reputation is a false
# saving — the switch costs more in hours than it returns in dollars. Gating at
# 3 costs 0.20¢/kWh against the ungated cheapest, which is a trade worth making
# by default.
MIN_PROVIDER_RATING = 3

# The feed writes -1 (and occasionally 0) for "no rating on file" rather than
# omitting the field. Unrated is not the same as badly rated, but it is equally
# not a basis for a recommendation, so unrated offers are held back too — and
# counted, so the UI can say how many were withheld rather than silently
# shrinking the list.
UNRATED_SENTINELS: frozenset[int] = frozenset({-1, 0})

# Cap on offers returned per property. The ranked list is long and repetitive
# past the first handful — every REP fields near-identical 12-month products.
MAX_OFFERS_PER_PROPERTY = 8

# Cap on time-of-use offers returned per property. Shown in their own list with
# no saving figure attached (see ``utility_offer_service``), so the operator is
# reading each one's terms rather than scanning a ranking — a shorter list than
# the priced one is the point.
MAX_TIME_OF_USE_OFFERS_PER_PROPERTY = 4

# Longest ``special_terms`` blurb to carry through, in characters. The field is
# REP-authored free text: some state the free window in one sentence, others run
# a few hundred characters of marketing. Truncating keeps a card readable, and
# the Electricity Facts Label link beside it is the binding version regardless.
MAX_SPECIAL_TERMS_CHARS = 260
