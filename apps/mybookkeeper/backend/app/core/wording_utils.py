"""Small helpers for writing English sentences from data."""
from collections.abc import Sequence


def count_phrase(count: int, singular: str, plural: str) -> str:
    """``1 picture``, ``2 pictures``."""
    if count == 1:
        return f"1 {singular}"
    return f"{count} {plural}"


def join_with_and(items: Sequence[str]) -> str:
    """``A``, ``A and B``, ``A, B and C``."""
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"
