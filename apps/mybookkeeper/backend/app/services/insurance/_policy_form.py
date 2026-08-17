"""Read the policy form out of a policy's free-text name.

The TDI feed covers the dwelling-fire line only. A homeowners policy can never
match it, so telling the operator "no filings found under this carrier's name"
for an HO-3 is a false statement — it implies a search that never happened.
Separating the two needs to know which form a policy is written on.

Nothing in the schema records that today: ``policy_name`` is free text the
operator typed or a declarations-page reader extracted, and the form code lives
inside it ("Dwelling Fire DP-3, 6738 Peerless St", "Homeowners Policy (HO-3)").
So this reads it back out.

That is a presentation-layer inference, and it is deliberately not treated as
authoritative. An unrecognised name resolves to ``UNKNOWN`` and is **checked
anyway** rather than declared out of scope — a wrong "nothing to check here"
silently hides a real increase, while a wrong check merely finds nothing. The
durable fix is a ``policy_type`` column set at entry; it needs a migration, a
backfill and a field on the policy form, so it is its own change.
"""
from __future__ import annotations

import re
from enum import Enum


class PolicyForm(str, Enum):
    """Which standard form a policy is written on."""

    DWELLING_FIRE = "dwelling_fire"
    HOMEOWNERS = "homeowners"
    UNKNOWN = "unknown"


# Form codes are the strong signal: DP-1/2/3 are the dwelling-fire series and
# HO-1..HO-8 the homeowners series. Hyphen optional, since operators type both.
# The trailing (?!\d) stops "DP-30" being read as DP-3.
_DWELLING_CODE = re.compile(r"\bDP[-\s]?[1-3](?!\d)", re.IGNORECASE)
_HOMEOWNERS_CODE = re.compile(r"\bHO[-\s]?[1-8](?!\d)", re.IGNORECASE)

# Weaker fallback for names carrying no form code at all.
_DWELLING_WORDS = re.compile(r"\b(dwelling|landlord|rental dwelling)\b", re.IGNORECASE)
_HOMEOWNERS_WORDS = re.compile(r"\bhomeowner'?s?\b", re.IGNORECASE)


def policy_form(policy_name: str | None) -> PolicyForm:
    """Best reading of the form from the policy's name.

    Codes beat words: a name saying "Homeowners Policy (DP-3)" is contradictory,
    and the code is the part that came off the declarations page.
    """
    if not policy_name:
        return PolicyForm.UNKNOWN

    if _DWELLING_CODE.search(policy_name):
        return PolicyForm.DWELLING_FIRE
    if _HOMEOWNERS_CODE.search(policy_name):
        return PolicyForm.HOMEOWNERS

    has_dwelling_word = bool(_DWELLING_WORDS.search(policy_name))
    has_homeowners_word = bool(_HOMEOWNERS_WORDS.search(policy_name))
    # Both words present and no code to break the tie: not confident enough to
    # rule the policy out, so let it be checked.
    if has_dwelling_word and not has_homeowners_word:
        return PolicyForm.DWELLING_FIRE
    if has_homeowners_word and not has_dwelling_word:
        return PolicyForm.HOMEOWNERS

    return PolicyForm.UNKNOWN


def is_out_of_scope(form: PolicyForm) -> bool:
    """Whether the dwelling feed could never say anything about this policy.

    Only a confident homeowners reading is out of scope. ``UNKNOWN`` is checked,
    because a missed increase is the costlier error.
    """
    return form is PolicyForm.HOMEOWNERS


def strip_property_from_name(
    policy_name: str, property_name: str | None,
) -> str:
    """The policy name with the property address removed.

    A declarations-page reader fills ``policy_name`` with the whole descriptor
    off the page — "Dwelling Fire DP-3, 6738 Peerless St, Houston, TX 77021" —
    and the card heading already names the property, so rendering both prints
    the address twice in one line.
    """
    if not property_name:
        return policy_name

    # Matched as a token sequence rather than as a literal substring. The two
    # fields come from different places — the property record and whatever a
    # declarations-page reader pulled off the PDF — so they disagree on
    # punctuation constantly ("Peerless St," vs "Peerless St."). Comparing
    # token-by-token with a permissive separator absorbs that; comparing
    # normalised strings by index does not, and mis-slices the moment the two
    # differ in length.
    tokens = re.findall(r"[A-Za-z0-9]+", property_name)
    if not tokens:
        return policy_name

    pattern = re.compile(
        r"\b" + r"[\s,.]+".join(re.escape(token) for token in tokens) + r"\b",
        re.IGNORECASE,
    )
    match = pattern.search(policy_name)
    if match is None:
        return policy_name

    before = policy_name[: match.start()].strip(" ,-–—")
    after = policy_name[match.end() :].strip(" ,-–—")
    combined = " ".join(part for part in (before, after) if part).strip(" ,-–—")
    return combined or policy_name
