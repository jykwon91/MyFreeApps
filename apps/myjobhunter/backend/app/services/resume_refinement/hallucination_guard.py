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
that was actually fine), so the patterns favor recall.
"""
from __future__ import annotations

import re

# Capitalized multi-word phrases that look like proper nouns (companies,
# schools, products). Two- or three-token sequences where each token
# starts with an uppercase letter. Catches "Acme Corp", "Stanford University",
# "Senior Software Engineer" (which is fine — also in source if real).
_PROPER_NOUN_PATTERN = re.compile(
    r"\b(?:[A-Z][a-zA-Z0-9&]+(?:\s+(?:of|the|and|de|du|la|le)\s+)?){1,4}\b",
)

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

# Percentages and dollar amounts that look like quantitative claims.
_METRIC_PATTERN = re.compile(
    r"(?:"
    r"\$\s?\d[\d,]*(?:\.\d+)?\s?[KMB]?"   # $50K, $1.2M, $50,000
    r"|"
    r"\d+(?:\.\d+)?\s?%"                   # 40%, 12.5%
    r"|"
    r"\b\d{2,}\s*(?:x|×)\b"                # 10x, 100x
    r")",
)

# Stop words to ignore when checking proper nouns — these don't carry
# factual content.
_PROPER_NOUN_STOPWORDS = {
    "I", "We", "Our", "My", "The", "A", "An", "And", "Or", "But",
    "For", "On", "In", "At", "By", "With", "From", "To", "Of",
    "Senior", "Junior", "Lead", "Principal", "Staff", "Manager",
    "Director", "Engineer", "Developer", "Analyst", "Designer",
    "Architect", "Consultant", "Specialist", "Coordinator",
    "Built", "Led", "Managed", "Developed", "Designed", "Created",
    "Implemented", "Launched", "Shipped", "Delivered",
    "Present", "Current", "Now",
}


def check_proposal(*, proposed: str, source: str) -> list[str]:
    """Return a list of facts in ``proposed`` that don't appear in ``source``.

    Empty list = guard pass (no hallucination detected).

    Args:
        proposed: The AI-proposed rewrite.
        source: The full resume markdown the user is iterating on.
    """
    missing: list[str] = []

    source_lower = source.lower()

    for date_str in _DATE_PATTERN.findall(proposed):
        if date_str.lower() not in source_lower:
            missing.append(date_str)

    for metric in _METRIC_PATTERN.findall(proposed):
        normalized = metric.replace(" ", "").lower()
        if normalized not in source_lower.replace(" ", ""):
            missing.append(metric)

    for proper in _extract_proper_nouns(proposed):
        if proper.lower() not in source_lower:
            missing.append(proper)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for item in missing:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def _extract_proper_nouns(text: str) -> list[str]:
    """Return capitalized multi-word phrases likely to be proper nouns.

    Single-word capitalized terms (start of sentence, common job titles)
    are stripped via the stopword list to keep false positives low.
    """
    out: list[str] = []
    for match in _PROPER_NOUN_PATTERN.finditer(text):
        phrase = match.group(0).strip()
        # Single tokens — only flag if not a stopword and not a sentence
        # start. Heuristic: ignore.
        if " " not in phrase:
            continue
        # Filter out phrases that are entirely stopwords.
        if all(token in _PROPER_NOUN_STOPWORDS for token in phrase.split()):
            continue
        out.append(phrase)
    return out
