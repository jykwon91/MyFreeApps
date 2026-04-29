"""Unit tests for ``platform_shared.core.encrypted_string_type``.

Covers:

- :class:`PIICodec` is required (constructor or subclass)
- ``process_bind_param`` encrypts strings and passes ``None`` through
- ``process_bind_param`` rejects non-string bind values with ``TypeError``
- ``process_result_value`` decrypts ciphertext and passes ``None`` through
- ``process_result_value`` re-raises ``InvalidToken`` as ``ValueError`` so
  callers don't have to import ``cryptography``
- Subclass-with-``_codec`` pattern works for the per-app convenience case
"""
from __future__ import annotations

import pytest

from platform_shared.core.encrypted_string_type import (
    EncryptedString,
    PIICodec,
)
from platform_shared.core.security import decrypt_pii, encrypt_pii

# Fixed parameters used for every test. Keep small + deterministic.
_KEY = "encrypted-string-test-key"
_SALT = b"est-salt"
_INFO = b"est-pii"


def _make_codec() -> PIICodec:
    """Build a codec that closes over the fixed test parameters."""

    def _enc(value: str | None) -> str | None:
        return encrypt_pii(value, secret_key=_KEY, salt=_SALT, info=_INFO)

    def _dec(value: str | None) -> str | None:
        return decrypt_pii(value, secret_key=_KEY, salt=_SALT, info=_INFO)

    return PIICodec(encrypt=_enc, decrypt=_dec)


# ---------------------------------------------------------------------------
# Codec wiring
# ---------------------------------------------------------------------------


class TestCodecRequirement:
    def test_constructor_codec_is_used(self) -> None:
        codec = _make_codec()
        et = EncryptedString(255, codec=codec)
        ct = et.process_bind_param("hello", dialect=None)
        assert ct is not None
        assert ct != "hello"
        back = et.process_result_value(ct, dialect=None)
        assert back == "hello"

    def test_missing_codec_raises_type_error(self) -> None:
        with pytest.raises(TypeError, match="requires a `codec=` argument"):
            EncryptedString(255)

    def test_subclass_with_codec_class_attr_works(self) -> None:
        codec = _make_codec()

        class MyAppEncryptedString(EncryptedString):
            _codec = codec

        et = MyAppEncryptedString(255)
        ct = et.process_bind_param("subclass-value", dialect=None)
        assert ct is not None
        back = et.process_result_value(ct, dialect=None)
        assert back == "subclass-value"

    def test_constructor_codec_overrides_subclass_class_attr(self) -> None:
        """If both are set, the constructor arg wins. This is what lets a
        per-app subclass be the default while ad-hoc instances can swap
        codecs (useful in tests and rotation tooling)."""
        codec_a = _make_codec()

        def _alt_enc(v: str | None) -> str | None:
            return f"ALT::{v}" if v is not None else None

        def _alt_dec(v: str | None) -> str | None:
            return v.removeprefix("ALT::") if v is not None else None

        codec_alt = PIICodec(encrypt=_alt_enc, decrypt=_alt_dec)

        class Sub(EncryptedString):
            _codec = codec_a

        # Default — class codec.
        et_default = Sub(255)
        ct_default = et_default.process_bind_param("x", dialect=None)
        assert ct_default is not None
        assert ct_default.startswith("gAAAAA")  # real Fernet ciphertext

        # Override — instance codec.
        et_alt = Sub(255, codec=codec_alt)
        ct_alt = et_alt.process_bind_param("x", dialect=None)
        assert ct_alt == "ALT::x"


# ---------------------------------------------------------------------------
# Bind/result behaviour
# ---------------------------------------------------------------------------


class TestProcessBindParam:
    def test_string_is_encrypted(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        ct = et.process_bind_param("hello", dialect=None)
        assert ct is not None
        assert ct != "hello"
        assert ct.startswith("gAAAAA")

    def test_none_passes_through(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        assert et.process_bind_param(None, dialect=None) is None

    @pytest.mark.parametrize("bad", [12345, b"bytes", 1.0, ["list"], {"dict": 1}])
    def test_non_string_raises_type_error(self, bad: object) -> None:
        et = EncryptedString(255, codec=_make_codec())
        with pytest.raises(TypeError, match="EncryptedString expected str"):
            et.process_bind_param(bad, dialect=None)


class TestProcessResultValue:
    def test_ciphertext_round_trips_to_plaintext(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        for plaintext in ["a", "alice@example.com", "1234567890" * 30]:
            ct = et.process_bind_param(plaintext, dialect=None)
            assert ct is not None
            back = et.process_result_value(ct, dialect=None)
            assert back == plaintext

    def test_none_passes_through(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        assert et.process_result_value(None, dialect=None) is None

    def test_non_string_stored_value_raises_type_error(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        with pytest.raises(TypeError, match="EncryptedString expected stored str"):
            et.process_result_value(12345, dialect=None)

    def test_tampered_ciphertext_raises_value_error(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        good = et.process_bind_param("hello", dialect=None)
        assert good is not None
        bad = good[:-2] + ("A" if good[-2] != "A" else "B") + good[-1]
        with pytest.raises(ValueError, match="Failed to decrypt EncryptedString"):
            et.process_result_value(bad, dialect=None)

    def test_decrypt_with_wrong_codec_raises_value_error(self) -> None:
        """A ciphertext encrypted under codec A cannot be decrypted by
        codec B (different key/salt/info). The TypeDecorator surfaces this
        as ``ValueError`` (not bare ``InvalidToken``)."""
        codec_a = _make_codec()
        # codec_b uses a different info string — same shape, different key family.
        def _enc_b(v: str | None) -> str | None:
            return encrypt_pii(v, secret_key=_KEY, salt=_SALT, info=b"DIFFERENT")

        def _dec_b(v: str | None) -> str | None:
            return decrypt_pii(v, secret_key=_KEY, salt=_SALT, info=b"DIFFERENT")

        codec_b = PIICodec(encrypt=_enc_b, decrypt=_dec_b)

        et_a = EncryptedString(255, codec=codec_a)
        et_b = EncryptedString(255, codec=codec_b)

        ct = et_a.process_bind_param("isolated", dialect=None)
        assert ct is not None
        with pytest.raises(ValueError, match="Failed to decrypt EncryptedString"):
            et_b.process_result_value(ct, dialect=None)


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------


class TestPythonType:
    def test_python_type_is_str(self) -> None:
        et = EncryptedString(255, codec=_make_codec())
        assert et.python_type is str
