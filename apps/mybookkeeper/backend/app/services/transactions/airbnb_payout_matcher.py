"""Pure decision logic for attributing an Airbnb payout to a property.

No DB / ORM here — the orchestrator (`attribution_service._attribute_airbnb_payout`)
loads the data and applies the decision. Kept pure so the cascade is exhaustively
table-testable (mirrors the `attribution_service.find_best_match` precedent).

Cascade, first hit wins, each tier requires exactly ONE distinct property or it
falls through:

1. **res_code → BookingStatement.property_id** → ``auto``. Strongest signal: an
   exact match on the ``UNIQUE(organization_id, res_code)`` key of a statement
   the user's own PM import created.
2. **exactly one Airbnb listing (with a property)** → ``auto``. Preserves the
   prior single-listing behavior, but now ranked *below* res_code so a payout
   whose code resolves elsewhere wins over "the user happens to have one
   listing".
3. **a listing title appears in the payout text** resolving to exactly one
   property → ``propose`` (review queue, not auto — free-text title substring
   is too weak to silently move money).
4. otherwise → ``unmatched``.

There is deliberately no guest/date tier: an Airbnb payout transaction carries
no guest field and ``payer_name`` is null, and direct payouts create no
``BookingStatement`` row — so no sound guest/date signal exists from the data
available here. A no-match payout goes to the review queue, where the operator
resolves it via the property-confirm path.
"""
import re
import uuid
from collections.abc import Sequence
from typing import Literal, NamedTuple, Protocol

# Airbnb confirmation codes are uppercase alphanumeric, almost always
# ``HM``-prefixed in payout emails. The HM literal + word boundaries + the
# uppercase-only class keep this precise (false auto-attribution of money is
# the cardinal sin — prefer a miss over a wrong auto). A context-anchored
# fallback catches non-HM codes only when an explicit "reservation/
# confirmation/booking" word precedes them.
#
# Every quantifier is bounded by a small constant (no unbounded ``\s+``/``\s*``
# that an attacker-controlled whitespace run could partition O(n) ways) →
# linear time, not ReDoS-exploitable. Do NOT reintroduce ``\s+``/``\s*`` here.
_HM_CODE_RE = re.compile(r"\bHM[A-Z0-9]{4,12}\b")
_ANCHORED_CODE_RE = re.compile(
    r"(?:reservation|confirmation|booking)(?: code)?[ \t\r\n#:]{1,3}([A-Z0-9]{6,12})\b",
    re.IGNORECASE,
)
# Deliberately lossy: a code past this offset is silently missed (→ review
# queue), never mis-attributed. Do NOT raise this unbounded — it caps the
# regex-scan attack surface (see the ReDoS note above).
_MAX_DESCRIPTION_SCAN = 4096
_MIN_TITLE_MATCH_LEN = 4

Confidence = Literal["auto", "propose", "unmatched"]


class ListingLike(Protocol):
    """Structural view of a Listing the decider needs (keeps this module
    ORM-free; the ORM ``Listing`` satisfies it at the call site)."""

    title: str
    property_id: uuid.UUID | None


class AirbnbMatch(NamedTuple):
    property_id: uuid.UUID | None
    confidence: Confidence


def parse_res_code(text: str | None) -> str | None:
    """Extract a single unambiguous Airbnb reservation code from free text.

    Returns the code only when exactly one distinct candidate is found —
    zero or multiple (e.g. adversarial / multi-reservation text) returns
    ``None`` so the caller falls through rather than auto-attributing wrong.
    """
    if not text:
        return None

    scanned = text[:_MAX_DESCRIPTION_SCAN]
    candidates: set[str] = set(_HM_CODE_RE.findall(scanned))

    for match in _ANCHORED_CODE_RE.finditer(scanned):
        code = match.group(1)
        # IGNORECASE on the anchor also relaxes the code class; keep only
        # genuine codes — uppercase, mixed letters+digits (rejects prose
        # words like "SUMMARY" and pure-numeric runs like an amount).
        if (
            code == code.upper()
            and any(c.isdigit() for c in code)
            and any(c.isalpha() for c in code)
        ):
            candidates.add(code)

    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def decide_airbnb_attribution(
    *,
    res_code_property_id: uuid.UUID | None,
    airbnb_listings: Sequence[ListingLike],
    txn_description: str | None,
    txn_address: str | None,
) -> AirbnbMatch:
    """Decide how an Airbnb payout attributes to a property. Pure."""
    # Tier 1 — res_code resolved to a property (exact, UNIQUE key). Outranks
    # the single-listing shortcut: a definitive code beats circumstance.
    if res_code_property_id is not None:
        return AirbnbMatch(res_code_property_id, "auto")

    # Tier 2 — exactly one Airbnb listing with a property (prior behavior,
    # preserved). A lone listing with no property falls through (previously
    # this silently stamped auto_exact with no property + no review).
    if len(airbnb_listings) == 1 and airbnb_listings[0].property_id is not None:
        return AirbnbMatch(airbnb_listings[0].property_id, "auto")

    # Tier 3 — a listing title occurs in the payout text, resolving to exactly
    # one property → propose only (free-text substring is review-grade, not
    # auto-grade).
    haystack = " ".join(p for p in (txn_description, txn_address) if p).lower()
    if haystack:
        matched: set[uuid.UUID] = set()
        for listing in airbnb_listings:
            title = (listing.title or "").strip()
            if (
                len(title) >= _MIN_TITLE_MATCH_LEN
                and listing.property_id is not None
                and title.lower() in haystack
            ):
                matched.add(listing.property_id)
        if len(matched) == 1:
            return AirbnbMatch(next(iter(matched)), "propose")

    return AirbnbMatch(None, "unmatched")
