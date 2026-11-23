"""Known answers for the keys MyBookkeeper derives from ENCRYPTION_KEY.

A derived key that changes makes stored data stop working with no error at
write time: OAuth tokens no longer decrypt, and reminder texts' lookup codes no
longer match their tenants' replies. These pin each key family to values made
under a fixed test secret (never the real key), so a refactor that changes a
salt, an info string or the derivation fails here first.
"""
from __future__ import annotations

import re
from unittest.mock import patch

import pytest
from cryptography.fernet import InvalidToken

from app.core import security
from app.core.config import settings

# Fernet tokens of "hello", made before the key derivation moved to the shared
# ``derive_key``: one under the token key, one under the legacy (unsalted) key.
_TOKEN_KEY_HELLO = (
    "gAAAAABrBMCkDnApxD86jXUlJfbLI_GITtecJK9-bxONUNur8ciM0Z6HK0N29j0P1ni8_MFlqX4z5kjSTdxcEW7f4_DNAN1WqA=="
)
_LEGACY_KEY_HELLO = (
    "gAAAAABrBMCkE9ljpIkUsNVpF6PbMBDee0pBu0rLm6Nmd2-JYivpOcR9_-hLxHTeZeqcxqWyYNxO_V8uoevBo-brk_u1TK5YLA=="
)


def _forget_derived_keys() -> None:
    security._fernet = None
    security._fernet_legacy = None
    security._pii_suite = None
    security._phone_lookup_key = None


@pytest.fixture(autouse=True)
def _test_secret():
    """Derive every key from a fixed secret, then let the real key be derived again."""
    _forget_derived_keys()
    with patch.object(settings, "encryption_key", "test-secret"):
        yield
    _forget_derived_keys()


class TestTokenKeys:
    def test_the_token_key_reads_tokens_made_before(self) -> None:
        assert security.decrypt_token(_TOKEN_KEY_HELLO) == "hello"
        assert security.get_fernet().decrypt(_TOKEN_KEY_HELLO.encode()) == b"hello"

    def test_the_legacy_key_still_reads_its_tokens(self) -> None:
        with pytest.raises(InvalidToken):
            security.get_fernet().decrypt(_LEGACY_KEY_HELLO.encode())
        assert security.decrypt_token(_LEGACY_KEY_HELLO) == "hello"

    def test_new_tokens_round_trip(self) -> None:
        assert security.decrypt_token(security.encrypt_token("refresh-token")) == "refresh-token"


class TestPhoneLookupHash:
    @pytest.mark.parametrize(
        ("e164", "code"),
        [
            ("+17135550100", "7f78196f28e6e84e43afda8436118a651cbb5accbc8f4be2c8f5e7c14fbf361f"),
            ("+17135550101", "b97baddc5115b4f81ad74bf2b112e26f025dbd736b5b577e04d8440d8eb9aab2"),
        ],
    )
    def test_known_answers(self, e164: str, code: str) -> None:
        assert security.phone_lookup_hash(e164) == code

    def test_is_64_lowercase_hex(self) -> None:
        assert re.fullmatch(r"[0-9a-f]{64}", security.phone_lookup_hash("+442079460958"))

    def test_another_secret_gives_other_codes(self) -> None:
        code = security.phone_lookup_hash("+17135550100")
        _forget_derived_keys()
        with patch.object(settings, "encryption_key", "another-secret"):
            assert security.phone_lookup_hash("+17135550100") != code

    def test_only_the_exact_e164_form_gives_the_code(self) -> None:
        """Callers normalise first: a formatted number is a different input."""
        assert security.phone_lookup_hash("(713) 555-0100") != security.phone_lookup_hash("+17135550100")
