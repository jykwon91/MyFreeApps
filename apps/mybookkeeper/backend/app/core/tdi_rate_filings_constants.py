"""Constants for the TDI rate-filings feed.

Texas requires every property insurer to file a rate change with the Department
of Insurance before it can charge it, and TDI republishes those filings as a
public Socrata dataset. It is free, unauthenticated, and covers the whole
market — the same posture as ``power_to_choose_constants`` for electricity.

Why this feed and not a quote site
==================================

The obvious candidate, TDI's own HelpInsure.com, returns only owner-occupied
forms (HO-3, HO-5, HO-A/B/C). A rental property on a dwelling-fire policy has
no entry point there — its form asks "rent or own" and means the occupant.
This dataset is filed *by policy subtype*, and ``Dwelling`` is the landlord
line, so it is the one public Texas source that speaks about investment
property at all.

What it gives, and what it does not
===================================

It gives rate *changes*, not rate *levels*: who is raising, by how much, and
from when. It cannot say what a specific property would be quoted. That turns
out to be the more actionable half — a renewal quote arrives as a fait
accompli, whereas a filing is public months before it reaches the operator's
mailbox, which is enough time to shop.
"""

# Socrata SODA endpoint. Public, no app token required at this volume; Socrata
# throttles anonymous callers rather than rejecting them.
TDI_RATE_FILINGS_URL = "https://data.texas.gov/resource/iubg-btfs.json"

# The subtype that carries landlord / dwelling-fire (DP-1, DP-2, DP-3) paper.
# Filtered server-side so the app never pulls the ~17k personal-auto rows.
DWELLING_SUBTYPE = "Dwelling"

# The dataset holds ~700 dwelling filings in total, so this ceiling fetches the
# entire line in one request while still bounding a runaway response.
MAX_FILINGS_FETCHED = 1_000

FETCH_TIMEOUT_SECONDS: float = 15.0

# Filings are republished as TDI processes them — daily at most. A short
# in-process cache spares the host a request per page view.
FILINGS_CACHE_TTL_SECONDS: int = 3_600

# --- Which filings actually count --------------------------------------------
#
# ``status`` is Pending or Closed, and a Closed filing carries a ``closed_type``
# saying how it closed. Only "Reviewed" means the rate took effect. Reporting a
# Withdrawn or Rejected filing as an upcoming increase would invent a rise the
# operator will never be charged — 63 of the 704 dwelling filings are in that
# state, so this is not a hypothetical.

STATUS_PENDING = "Pending"
STATUS_CLOSED = "Closed"

# The only ``closed_type`` that means "this rate is in force".
CLOSED_TYPE_IN_FORCE = "Reviewed"

# Closed dispositions that mean the filing never took effect.
CLOSED_TYPES_ABANDONED: frozenset[str] = frozenset({"Withdrawn", "Rejected"})

# --- Relevance ----------------------------------------------------------------

# How far back a filing stays interesting. A rate change from four years ago is
# already baked into what the operator pays today and says nothing about the
# next renewal.
FILING_LOOKBACK_DAYS = 730

# A change smaller than this is inside the noise of a reunderwriting and not
# worth putting in front of anyone as a rate movement.
MIN_NOTABLE_CHANGE_PCT = 1.0

# Stand-in renewal date for a policy with no expiration recorded, counted from
# today. Filings are matched against a policy's renewal date, and without one
# there is nothing to compare to — assuming a renewal roughly a term-quarter
# out keeps those policies in the outlook instead of silently dropping them.
RENEWAL_HORIZON_DAYS = 120

# Cap on carriers shown in the market view. One row per carrier, soonest
# effective first, so this is "the N carriers whose next dwelling rate lands
# earliest". Each of the two groups below is capped separately.
MAX_MARKET_FILINGS = 25

# How many rows of each market group are shown before the operator has to
# expand. Twenty undifferentiated rows is what the first cut shipped, and it
# read as a wall rather than a shortlist.
MARKET_GROUP_PREVIEW = 5

# --- Who the operator can actually buy from -----------------------------------
#
# These file dwelling rates with TDI and so appear in the raw feed, but none of
# them is a carrier an ordinary landlord can place a policy with. Listing them
# under "worth asking your agent about" is not merely noise — it is wrong, and
# it sends the operator to ask for something that cannot be sold to them.
#
# Matched on a token-subset basis (same helper as carrier matching) so that
# legal-name drift — "TEXAS WINDSTORM INSURANCE ASSN" vs "...ASSOCIATION" —
# does not quietly let one back in.

NON_PURCHASABLE_CARRIERS: tuple[str, ...] = (
    # State-run residual market, sold only where no admitted carrier will write.
    "TEXAS WINDSTORM INSURANCE ASSOCIATION",
    # The FAIR Plan: last-resort pool, eligibility requires prior declinations.
    "TEXAS FAIR PLAN ASSOCIATION",
    # An advisory rating bureau. Licenses loss-cost data to insurers; sells no
    # policies to anyone.
    "INSURANCE SERVICES OFFICE",
    # Membership limited to military personnel and their families.
    "ARMED FORCES INSURANCE EXCHANGE",
    # Files on behalf of member insurers; not itself a market.
    "AMERICAN ASSOCIATION OF INSURANCE SERVICES",
)

# --- Why an outlook could not be produced -------------------------------------
#
# Shown to the operator instead of an empty filing list, so "we could not check"
# never reads as "nothing is coming". These are three genuinely different
# situations and collapsing them into one string is what made the first cut
# claim it had searched for a homeowners policy it never looked at.

REASON_NO_CARRIER = "No carrier recorded on this policy — add one to check it."

REASON_NO_FILINGS = (
    "No landlord-policy rate filing found under this carrier's name in the "
    "last two years. Either they have not filed one, or the name on this "
    "policy does not match how they file with the state."
)

# Not a failure to find anything — this dataset was never going to apply.
# Saying "no filings found" here implies a search happened, and none did.
REASON_NOT_DWELLING = (
    "Texas publishes rate filings for landlord (dwelling-fire) policies only, "
    "so there is nothing to check against a homeowners policy."
)

REASON_FEED_DOWN = (
    "The Texas Department of Insurance filing data could not be reached, so "
    "nothing was checked."
)
