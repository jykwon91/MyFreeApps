"""Curated keyword denylists for industry-exclusion chips on /discover.

The frontend's "Exclude industries" toggle group surfaces semantic chips
(``government_defense``, ``staffing_recruiting``, etc.) — short labels
the operator clicks instead of recalling and typing 16 individual
company names. The chip names are stored on
``discovery_sources.config.excluded_industry_chips``; this module
expands them into the actual substring-match keyword list at fetch
time.

Why expansion at fetch time (not at save time)
==============================================

Storing the chip names rather than the expanded keyword list means we
can refine the underlying lists (add a newly-spun-up defense
contractor, drop one that's broadened beyond gov work) without
migrating every existing saved search's config. Existing searches
benefit from the new lists on their next refresh.

Why substring match (not exact match or regex)
==============================================

The operator's mental model is "if any of these words appear in the
title, company, description, or publisher field of a posting, drop
it." Substring is the simplest implementation that matches that
model. Edge cases (false-positive matches like "ManTech" → "tech",
"defensive" → "defense") are rare and the cost is dropping a posting
the operator probably wouldn't have wanted anyway.

Adding new chips
================

1. Pick a snake_case key.
2. Add an entry below with the keywords (lowercase; substring match
   is case-insensitive at apply time).
3. Mirror the entry in ``apps/myjobhunter/frontend/src/features/discover/industry-chips.ts``
   so the frontend renders a chip with the same key.
4. The keyword list should be conservative — false-positives drop
   real opportunities. Add a company / term only if the operator
   would always want it filtered.
"""
from __future__ import annotations

from typing import Iterable


# Each chip key maps to the substring keywords it expands into. Keep
# entries lowercase; the apply step lowercases haystacks before
# matching so case doesn't matter at match time.
INDUSTRY_DENYLISTS: dict[str, tuple[str, ...]] = {
    "government_defense": (
        # Top-tier US defense contractors and their common abbreviations.
        "lockheed martin",
        "lockheed",
        "boeing defense",
        "northrop grumman",
        "northrop",
        "raytheon",
        "rtx ",  # space avoids matching "rtx 4090" gpu mentions
        "general dynamics",
        "bae systems",
        "l3harris",
        "leidos",
        "saic",
        "caci",
        "mantech",
        "booz allen",
        "mitre",
        "anduril",
        "peraton",
        "kbr",
        # Clearance + federal-customer language.
        "secret clearance",
        "top secret",
        "ts/sci",
        "tssci",
        "active clearance",
        "security clearance",
        "dod ",
        "department of defense",
        "defense contractor",
        "federal contractor",
        "us federal",
        "intelligence community",
    ),
    "staffing_recruiting": (
        # Third-party staffing/recruiting firms — postings are
        # typically W2 contracts at a real client, not jobs at the
        # firm itself. Operator usually wants to skip these.
        "staffing",
        "recruiting firm",
        "contract to hire",
        "w2 contract",
        "c2c",
        "corp to corp",
        "jobs via dice",
        "via dice",
        "jobs via",
    ),
    "consulting_big4": (
        "deloitte",
        "accenture",
        "kpmg",
        "ernst & young",
        "ernst and young",
        "pricewaterhousecoopers",
        "pwc ",
    ),
    "crypto_web3": (
        "crypto",
        "blockchain",
        "web3",
        "defi",
        "nft",
        "smart contract engineer",
    ),
    "adtech_gambling": (
        "adtech",
        "ad tech",
        "programmatic ad",
        "gambling",
        "sportsbook",
        "casino",
        "betting",
    ),
}


def expand_excluded_keywords(
    chips: Iterable[str] | None,
    custom_keywords: Iterable[str] | None,
) -> list[str]:
    """Merge industry chip expansions with the operator's custom keywords.

    Returns a deduplicated list of lowercase substrings ready to feed
    into the post-fetch filter's case-insensitive match.

    Unknown chip keys are silently skipped — they're stored on the
    saved search's config so a frontend bug renaming a chip key
    shouldn't break the worker.
    """
    out: list[str] = []
    seen: set[str] = set()

    if chips:
        for chip in chips:
            if not isinstance(chip, str):
                continue
            keywords = INDUSTRY_DENYLISTS.get(chip)
            if keywords is None:
                continue
            for kw in keywords:
                normalized = kw.strip().lower()
                if normalized and normalized not in seen:
                    seen.add(normalized)
                    out.append(normalized)

    if custom_keywords:
        for kw in custom_keywords:
            if not isinstance(kw, str):
                continue
            normalized = kw.strip().lower()
            if normalized and normalized not in seen:
                seen.add(normalized)
                out.append(normalized)

    return out
