"""Source quality ranking for dedup resolution.

Pure function — no DB queries, no side effects.
Higher rank = more authoritative source document.
"""

_QUALITY_RANK: dict[str, int] = {
    "invoice": 100,
    "receipt": 80,
    "statement": 60,
    "year_end_statement": 60,
    "contract": 40,
    "other": 20,
}


def source_quality_rank(document_type: str | None) -> int:
    """Return quality rank for a document type. 0 if unknown."""
    return _QUALITY_RANK.get(document_type or "", 0)


QUALITY_GAP_THRESHOLD = 20
