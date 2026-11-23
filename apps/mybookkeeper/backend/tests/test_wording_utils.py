"""Writing English phrases from data (app.core.wording_utils)."""
from __future__ import annotations

import pytest

from app.core.wording_utils import count_phrase, join_with_and


@pytest.mark.parametrize(
    ("count", "expected"),
    [(0, "0 pictures"), (1, "1 picture"), (2, "2 pictures"), (10, "10 pictures")],
)
def test_count_phrase(count: int, expected: str) -> None:
    assert count_phrase(count, "picture", "pictures") == expected


@pytest.mark.parametrize(
    ("items", "expected"),
    [
        ([], ""),
        (["Ravi"], "Ravi"),
        (["Ravi", "Mina"], "Ravi and Mina"),
        (["Ravi", "Mina", "Sonu"], "Ravi, Mina and Sonu"),
    ],
)
def test_join_with_and(items: list[str], expected: str) -> None:
    assert join_with_and(items) == expected
