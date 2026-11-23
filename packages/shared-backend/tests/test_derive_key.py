"""Tests for platform_shared.core.security.derive_key.

The known answers were computed once, when ``_derive_fernet`` was rebuilt on
``derive_key``. They pin HKDF-SHA256 (length, salt and info handling), so a
refactor can't silently change a key family already holding data: tokens,
PII columns, or lookup codes.
"""
from __future__ import annotations

from platform_shared.core.security import create_fernet_suite, derive_key

_SECRET = "test-secret"
_SALT = b"test-salt"
_INFO = b"test-info"
_KEY_WITH_SALT = "991dcc616e9af4fdb855d9ddc44429140af0f3c8f784d82e9b48e5dead438001"
_KEY_WITHOUT_SALT = "c903127a870cf6b37c9a3a01f1c735b319956236871d31bcda6a464e8c023903"
# create_fernet_suite(_SECRET, salt=_SALT, info=_INFO).encrypt("hello")
_TOKEN = (
    "gAAAAABrBLx78iGQxBJfDzPg9RTb2y-A1CEWUROw5r_vQOj2Z2hxZ-2HhZBIDZ0L3WrTLWldw9uoO4CMCYwGqr8vgLa6VFkLfg=="
)


def test_known_answer() -> None:
    assert derive_key(_SECRET, salt=_SALT, info=_INFO).hex() == _KEY_WITH_SALT


def test_known_answer_without_a_salt() -> None:
    assert derive_key(_SECRET, salt=None, info=_INFO).hex() == _KEY_WITHOUT_SALT


def test_each_info_gives_its_own_key() -> None:
    assert derive_key(_SECRET, salt=_SALT, info=b"tokens") != derive_key(
        _SECRET, salt=_SALT, info=b"lookup-codes",
    )


def test_fernet_suites_still_read_existing_ciphertext() -> None:
    assert create_fernet_suite(_SECRET, salt=_SALT, info=_INFO).decrypt(_TOKEN) == "hello"
