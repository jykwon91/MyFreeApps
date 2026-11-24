"""is_item_container: the containers the Sentry hooks look inside."""

from __future__ import annotations

from collections import deque

import pytest

from platform_shared.core.item_container import is_item_container


class _Batch(list[object]):
    """An app's own list."""


@pytest.mark.parametrize(
    "value",
    [[1], (1,), {1}, frozenset({1}), deque([1]), _Batch([1])],
    ids=["list", "tuple", "set", "frozenset", "deque", "list-subclass"],
)
def test_containers_holding_their_items_count(value: object) -> None:
    assert is_item_container(value)


@pytest.mark.parametrize(
    "value",
    [
        range(10**12),
        (n for n in range(3)),
        "text",
        b"bytes",
        {"key": "value"},
        None,
        42,
    ],
    ids=["range", "generator", "str", "bytes", "dict", "none", "int"],
)
def test_other_values_do_not(value: object) -> None:
    """A range or a generator would have to make its items, possibly billions."""
    assert not is_item_container(value)
