"""Tests for platform_shared.core.blind_index."""
from __future__ import annotations

import re

from platform_shared.core.blind_index import blind_index
from platform_shared.core.security import derive_key

_KEY = derive_key("test-secret", salt=b"test-salt", info=b"test-info")
_NUMBER = "+17135550100"


def test_known_answer() -> None:
    assert blind_index(_KEY, _NUMBER) == (
        "a60a9436af1b70794e7f31bad00aec511fe6731ddc952621c4e34bba7ecbeabd"
    )


def test_is_64_lowercase_hex_characters() -> None:
    assert re.fullmatch(r"[0-9a-f]{64}", blind_index(_KEY, _NUMBER))


def test_the_same_value_gives_the_same_code() -> None:
    assert blind_index(_KEY, _NUMBER) == blind_index(_KEY, _NUMBER)


def test_another_value_gives_another_code() -> None:
    assert blind_index(_KEY, _NUMBER) != blind_index(_KEY, "+17135550101")


def test_another_key_gives_another_code() -> None:
    other_key = derive_key("test-secret", salt=b"test-salt", info=b"other-info")
    assert blind_index(_KEY, _NUMBER) != blind_index(other_key, _NUMBER)
