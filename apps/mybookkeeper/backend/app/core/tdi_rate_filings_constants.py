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

# --- Surviving a hiccup -------------------------------------------------------
#
# On 2026-08-17 a single call resolved nothing — ``[Errno -2] Name or service
# not known`` — and the whole section reported the feed unreachable. It was one
# getaddrinfo miss: the same container had read the feed successfully earlier
# the same day, and no other app on the host logged a resolution failure in the
# fourteen days around it. One retry would have hidden it entirely.
#
# Bounded two ways, because the two failures that land here have opposite
# costs. A DNS miss or refused connection comes back in milliseconds, so
# retrying is nearly free; a genuine timeout has already spent
# FETCH_TIMEOUT_SECONDS of the operator's wait, and a second one would double
# it. The attempt count caps the cheap case, the wall-clock budget caps the
# expensive one — whichever runs out first ends the fetch.

MAX_FETCH_ATTEMPTS: int = 3

RETRY_INITIAL_DELAY_SECONDS: float = 0.5

FETCH_BUDGET_SECONDS: float = 20.0

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

# --- Carriers that will never appear in this feed -----------------------------
#
# A surplus-lines (non-admitted) carrier is exempt from Texas rate filing:
# TDI does not regulate what it charges, so no amount of correct spelling will
# find a filing for one. Much of the Texas landlord market is written this way
# — the 2026 Peerless renewal is on Lloyd's syndicate paper — and reporting
# that as "either they have not filed or the name does not match" sends the
# operator to fix a spelling that was never wrong.
#
# Matched as substrings against the carrier name with punctuation folded away,
# NOT by the token-subset rule used for carrier matching: ``carrier_tokens``
# discards LLOYD, LLOYDS and UNDERWRITERS as corporate boilerplate, which are
# exactly the words that identify this paper.
#
# The distinction that makes this list delicate: "Certain Underwriters at
# Lloyd's of London" is the London surplus-lines market, while "SafePoint
# Lloyds", "Foremost Lloyds of Texas" and "State Farm Lloyds" are Texas Lloyds
# plan companies — fully admitted Texas carriers that DO file, and three of
# which are in the live feed. Matching bare "LLOYDS" would wrongly exclude
# them, so the markers carry the qualifying words.
#
# Deliberately a floor rather than an admissions registry. TDI publishes no
# machine-readable admitted-carrier list, so this names only the writers whose
# status is unambiguous; everything else falls through to REASON_NO_FILINGS,
# which names surplus lines as one of its three possibilities for that reason.

NON_ADMITTED_CARRIER_MARKERS: tuple[str, ...] = (
    # Lloyd's of London syndicate paper, written in Texas as surplus lines.
    "CERTAIN UNDERWRITERS",
    "LLOYDS OF LONDON",
    # US excess & surplus writers. Each is the non-admitted arm of a group
    # whose admitted companies file separately and under different names.
    "LEXINGTON INSURANCE",
    "SCOTTSDALE INSURANCE",
    "EVANSTON INSURANCE",
    "KINSALE INSURANCE",
)

# --- Why an outlook could not be produced -------------------------------------
#
# Shown to the operator instead of an empty filing list, so "we could not check"
# never reads as "nothing is coming". These are three genuinely different
# situations and collapsing them into one string is what made the first cut
# claim it had searched for a homeowners policy it never looked at.

REASON_NO_CARRIER = "No carrier recorded on this policy — add one to check it."

# Three genuinely different things produce an empty result, and the first cut
# named only two of them. A surplus-lines carrier is not a search that failed:
# Texas does not regulate its rates, so it will never be in this dataset. Left
# out, the operator reads "the name might not match" and goes to correct a
# spelling that was never wrong. ``NON_ADMITTED_CARRIER_MARKERS`` catches the
# ones that can be named with certainty; this covers the rest.
REASON_NO_FILINGS = (
    "No landlord-policy rate filing found under this carrier's name in the "
    "last two years. That means one of three things: they write on a "
    "surplus-lines (non-admitted) basis, which Texas does not regulate rates "
    "for and which will never appear here; they have not filed in that time; "
    "or the name on this policy does not match how they file with the state."
)

# Not a failure to find anything — this dataset was never going to apply.
# Saying "no filings found" here implies a search happened, and none did. The
# closing clause matters: without it the operator has no way to tell this from
# a gap that might fill in by the next renewal.
REASON_NOT_DWELLING = (
    "Texas only publishes rate filings for landlord (dwelling-fire) policies, "
    "not homeowners policies — there is nothing in this feed to check this "
    "policy against, and there never will be."
)

REASON_NON_ADMITTED_CARRIER = (
    "This carrier writes on a surplus-lines (non-admitted) basis. Texas does "
    "not regulate surplus-lines rates, so it will never appear in this feed — "
    "there is nothing to check here, now or at any future renewal."
)

REASON_FEED_DOWN = (
    "The Texas Department of Insurance filing data could not be reached, so "
    "nothing was checked."
)
