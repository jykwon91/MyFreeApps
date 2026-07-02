"""Hallucination guard for AI-proposed resume rewrites.

Per the spec: *"Basic check (company names + dates preserved). When in
doubt, the AI ASKS for clarification rather than guessing."*

This is a defense-in-depth layer — the prompt itself instructs Claude
to never invent facts, and to ask for clarification when the source is
ambiguous. The guard catches the cases where the model ignores the
instruction. On a guard miss, the caller treats the proposal as
invalid and the user is asked to retry.

The guard is intentionally conservative: it flags facts that appear in
the proposal but NOT in the source. False negatives (missing a real
hallucination) are worse than false positives (flagging a sentence
that was actually fine), so the patterns favor recall. False positives
are recoverable: when the user confirms a flagged fact is accurate, the
caller records it in the session-level ``confirmed_facts`` allowlist and
passes it back in — a confirmed fact is never re-flagged.
"""
from __future__ import annotations

import re
from collections.abc import Iterable

# One capitalized token: "Acme", "API", "R2", "C++".
_CAP_TOKEN = r"[A-Z][A-Za-z0-9&+'-]*"

# Lowercase words that legitimately join two capitalized tokens inside
# ONE proper noun ("Bank of America", "École de Paris").
_CONNECTOR_WORDS = "of|the|and|de|du|la|le"

# A run of capitalized tokens, optionally joined by single connector
# words: "Acme Corp", "Forrester Innovation Award", "Bank of America",
# "API and React". Connectors may only appear BETWEEN capitalized
# tokens, so a run never swallows the lowercase remainder of a sentence.
_PROPER_NOUN_PATTERN = re.compile(
    rf"\b{_CAP_TOKEN}(?:\s+(?:(?:{_CONNECTOR_WORDS})\s+)?{_CAP_TOKEN})*",
)

# "and" joins two INDEPENDENT facts ("API and React"); the other
# connectors are part of a single name ("Bank of America"). Runs are
# decomposed at "and" and each side is verified on its own, so two
# individually-sourced facts never merge into one unverifiable phrase.
_SPLIT_CONNECTOR = "and"
_CONNECTOR_TOKENS = set(_CONNECTOR_WORDS.split("|"))

# Year ranges, single years, and YYYY-MM date strings.
_DATE_PATTERN = re.compile(
    r"\b(?:"
    r"\d{4}-\d{2}(?:-\d{2})?"      # 2024-01 / 2024-01-15
    r"|"
    r"(?:19|20)\d{2}\s*[-–—to]+\s*(?:19|20)\d{2}"  # 2018-2022
    r"|"
    r"(?:19|20)\d{2}"               # 2024
    r")\b",
)

# Percentages, dollar amounts, magnitude-suffixed counts, and Nx
# multipliers that look like quantitative claims.
_METRIC_PATTERN = re.compile(
    r"(?:"
    r"\$\s?\d[\d,]*(?:\.\d+)?\s?[KMB]?"   # $50K, $1.2M, $50,000
    r"|"
    r"\d+(?:\.\d+)?\s?%"                   # 40%, 12.5%
    r"|"
    r"\b\d+(?:\.\d+)?\s?[KMB]\b"           # 500K, 1.2M, 3B
    r"|"
    r"\b\d{2,}\s*(?:x|×)\b"                # 10x, 100x
    r")",
)

# Tokens that don't carry factual content on their own: pronouns,
# articles, job-title words, and the action verbs resume bullets open
# with. Stripped from the EDGES of a candidate phrase before checking.
_PROPER_NOUN_STOPWORDS = {
    "I", "We", "Our", "My", "The", "A", "An", "And", "Or", "But",
    "For", "On", "In", "At", "By", "With", "From", "To", "Of",
    "Senior", "Junior", "Lead", "Principal", "Staff", "Manager",
    "Director", "Engineer", "Developer", "Analyst", "Designer",
    "Architect", "Consultant", "Specialist", "Coordinator", "Software",
    "Built", "Led", "Managed", "Developed", "Designed", "Created",
    "Implemented", "Launched", "Shipped", "Delivered", "Won", "Owned",
    "Improved", "Reduced", "Increased", "Architected", "Spearheaded",
    "Drove", "Grew", "Present", "Current", "Now",
}

# Characters that end a sentence / open a bullet — a capitalized token
# right after one of these is ordinary sentence capitalization, not
# evidence of a proper noun.
_SENTENCE_BOUNDARY_CHARS = set(".!?:;\n\r-–—•*#>|([\"'`")


def check_proposal(
    *,
    proposed: str,
    source: str,
    confirmed_facts: Iterable[str] | None = None,
) -> list[str]:
    """Return a list of facts in ``proposed`` that don't appear in ``source``.

    Empty list = guard pass (no hallucination detected).

    Args:
        proposed: The AI-proposed rewrite.
        source: The full resume markdown the user is iterating on.
        confirmed_facts: Facts the user has explicitly confirmed as
            accurate in this session. Anything matching (case- and
            whitespace-insensitive) is never flagged, so a user answer
            of "yes, that's correct" actually unblocks the loop.
    """
    missing: list[str] = []

    source_lower = source.lower()
    source_squashed = source_lower.replace(" ", "")

    for date_str in _DATE_PATTERN.findall(proposed):
        if date_str.lower() not in source_lower:
            missing.append(date_str)

    for metric in _METRIC_PATTERN.findall(proposed):
        normalized = metric.replace(" ", "").lower()
        if normalized not in source_squashed:
            missing.append(metric)

    for proper in _extract_proper_nouns(proposed):
        if proper.lower() not in source_lower:
            missing.append(proper)

    if confirmed_facts:
        confirmed = {_normalize(f) for f in confirmed_facts}
        confirmed_squashed = {c.replace(" ", "") for c in confirmed}
        missing = [
            item
            for item in missing
            if _normalize(item) not in confirmed
            and _normalize(item).replace(" ", "") not in confirmed_squashed
        ]

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for item in missing:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def _normalize(s: str) -> str:
    return " ".join(s.lower().split())


def _extract_proper_nouns(text: str) -> list[str]:
    """Return capitalized phrases likely to be proper nouns.

    Pipeline per capitalized run:

    1. Decompose at "and" — it coordinates independent facts, so
       "API and React" is checked as "API" + "React", never as one
       phrase (the connector-merge false positive that dead-ended the
       clarify loop in production).
    2. Strip stopword / connector tokens from each part's edges —
       "Won the Forrester Innovation Award" → "Forrester Innovation
       Award".
    3. Keep multi-token parts, and single tokens that are NOT ordinary
       sentence capitalization (a bullet opening with "Built ..." is
       noise; "... at Hooli" mid-sentence is a checkable fact).
    """
    out: list[str] = []
    for match in _PROPER_NOUN_PATTERN.finditer(text):
        run = match.group(0)
        first_token = run.split()[0] if run.split() else ""
        run_is_sentence_initial = _is_sentence_initial(text, match.start())

        for part_tokens in _split_at_and(run.split()):
            tokens = _strip_stopword_edges(part_tokens)
            if not tokens:
                continue
            phrase = " ".join(tokens)
            if len(tokens) == 1 and run_is_sentence_initial and tokens[0] == first_token:
                # Lone capitalized word opening the sentence — can't
                # distinguish a proper noun from ordinary capitalization.
                continue
            out.append(phrase)
    return out


def _split_at_and(tokens: list[str]) -> list[list[str]]:
    parts: list[list[str]] = [[]]
    for token in tokens:
        if token.lower() == _SPLIT_CONNECTOR:
            if parts[-1]:
                parts.append([])
        else:
            parts[-1].append(token)
    return [p for p in parts if p]


def _strip_stopword_edges(tokens: list[str]) -> list[str]:
    def _is_noise(token: str) -> bool:
        return token in _PROPER_NOUN_STOPWORDS or token.lower() in _CONNECTOR_TOKENS

    start, end = 0, len(tokens)
    while start < end and _is_noise(tokens[start]):
        start += 1
    while end > start and _is_noise(tokens[end - 1]):
        end -= 1
    return tokens[start:end]


def _is_sentence_initial(text: str, match_start: int) -> bool:
    """True when the match opens the text, a sentence, or a bullet."""
    before = text[:match_start].rstrip()
    if not before:
        return True
    return before[-1] in _SENTENCE_BOUNDARY_CHARS
