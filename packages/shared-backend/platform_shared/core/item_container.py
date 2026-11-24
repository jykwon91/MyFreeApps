"""Whether a value is one of Python's built-in item containers."""

from __future__ import annotations

from collections import deque
from collections.abc import Collection
from typing import TypeGuard


def is_item_container(value: object) -> TypeGuard[Collection[object]]:
    """True for a list, tuple, set, frozenset or deque, or a subclass of one.

    These hold every item in memory and write each one in their ``repr``, so
    walking them costs no more than logging them did. A lazy sequence such as
    ``range`` would have to make its items one by one, possibly billions.
    """
    return isinstance(value, list | tuple | set | frozenset | deque)


__all__ = ["is_item_container"]
