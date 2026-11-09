"""Render string constants as a SQL ``IN`` list for CHECK constraints."""
from collections.abc import Iterable


def sql_in_list(values: Iterable[str]) -> str:
    """``("us", "eu")`` -> ``"('us', 'eu')"``.

    ``f"{values!r}"`` is wrong for a one-value tuple (``('us',)`` is not SQL).
    Values are code constants, never user input; a quote in one is a bug.
    """
    items = list(values)
    if not items or any("'" in v for v in items):
        raise ValueError(f"sql_in_list: need non-empty values without quotes, got {items!r}")
    return "(" + ", ".join(f"'{v}'" for v in items) + ")"
