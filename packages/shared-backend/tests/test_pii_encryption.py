"""Unit tests for ``platform_shared.core.security.encrypt_pii`` / ``decrypt_pii``.

Covers:

- Roundtrip: ``decrypt_pii(encrypt_pii(x)) == x``
- ``None`` passthrough on both helpers
- Fernet non-determinism (same plaintext + key+salt+info -> different ciphertext)
- Key isolation: changing any of ``secret_key`` / ``salt`` / ``info`` makes
  the ciphertext undecryptable with the original parameters
- Stability fixture: a known-good ciphertext (fixed plaintext + key + salt +
  info) decrypts to the expected plaintext. This is the regression contract
  that guards every existing PII column in production from silent salt/info
  drift in future refactors.
"""
from __future__ import annotations

import pytest
from cryptography.fernet import InvalidToken

from platform_shared.core.security import decrypt_pii, encrypt_pii

# A fixed (key, salt, info, plaintext, ciphertext) tuple used as a regression
# guard. The ciphertext below was produced ONCE at refactor time using the
# same parameters; future refactors that silently change HKDF derivation will
# fail the ``test_known_ciphertext_still_decrypts`` test.
_FIXED_KEY = "test-secret-stability-key"
_FIXED_SALT = b"test-salt-v1"
_FIXED_INFO = b"test-stability-pii-encryption"
_FIXED_PLAINTEXT = "applicant.nurse@example.com"

# ---------------------------------------------------------------------------
# Roundtrip + null handling
# ---------------------------------------------------------------------------


class TestRoundtrip:
    def test_basic_roundtrip(self) -> None:
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        assert ct != _FIXED_PLAINTEXT
        back = decrypt_pii(
            ct,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert back == _FIXED_PLAINTEXT

    @pytest.mark.parametrize("plaintext", ["", "x", "a@b.co", "1234567890" * 50])
    def test_roundtrip_various_lengths(self, plaintext: str) -> None:
        ct = encrypt_pii(
            plaintext, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        back = decrypt_pii(
            ct, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert back == plaintext

    def test_roundtrip_unicode(self) -> None:
        plaintext = "Héllo, wörld — 你好"
        ct = encrypt_pii(
            plaintext, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        back = decrypt_pii(
            ct, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert back == plaintext


class TestNoneHandling:
    def test_encrypt_none_returns_none(self) -> None:
        result = encrypt_pii(
            None, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert result is None

    def test_decrypt_none_returns_none(self) -> None:
        result = decrypt_pii(
            None, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert result is None


# ---------------------------------------------------------------------------
# Non-determinism
# ---------------------------------------------------------------------------


class TestNonDeterminism:
    def test_same_inputs_produce_different_ciphertext(self) -> None:
        """Fernet uses a random IV — same key+salt+info+plaintext should
        yield different ciphertext on each call. Critical so equality
        lookups against encrypted columns can't accidentally succeed."""
        a = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        b = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert a != b
        # …but both decrypt to the same plaintext.
        assert decrypt_pii(
            a, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        ) == _FIXED_PLAINTEXT
        assert decrypt_pii(
            b, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        ) == _FIXED_PLAINTEXT


# ---------------------------------------------------------------------------
# Key isolation — every parameter matters
# ---------------------------------------------------------------------------


class TestKeyIsolation:
    """Changing any of ``secret_key``, ``salt``, or ``info`` MUST make the
    ciphertext undecryptable with the original parameters. This is what
    keeps app-level PII key families separated even when apps share a
    secret."""

    def test_different_info_does_not_decrypt(self) -> None:
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=b"app-a-pii",
        )
        assert ct is not None
        with pytest.raises(InvalidToken):
            decrypt_pii(
                ct,
                secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=b"app-b-pii",
            )

    def test_different_salt_does_not_decrypt(self) -> None:
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=b"salt-v1", info=_FIXED_INFO,
        )
        assert ct is not None
        with pytest.raises(InvalidToken):
            decrypt_pii(
                ct,
                secret_key=_FIXED_KEY, salt=b"salt-v2", info=_FIXED_INFO,
            )

    def test_different_secret_does_not_decrypt(self) -> None:
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key="secret-a", salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        with pytest.raises(InvalidToken):
            decrypt_pii(
                ct,
                secret_key="secret-b", salt=_FIXED_SALT, info=_FIXED_INFO,
            )

    def test_same_key_salt_info_different_plaintexts_isolated(self) -> None:
        """Different plaintexts under the same key produce ciphertexts that
        each only decrypt back to their own plaintext."""
        ct_a = encrypt_pii(
            "alpha", secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        ct_b = encrypt_pii(
            "bravo", secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct_a != ct_b
        assert decrypt_pii(
            ct_a, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        ) == "alpha"
        assert decrypt_pii(
            ct_b, secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        ) == "bravo"


# ---------------------------------------------------------------------------
# Tamper detection
# ---------------------------------------------------------------------------


class TestTamperDetection:
    def test_modified_ciphertext_fails(self) -> None:
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        # Flip a character in the middle of the token so we don't land in the
        # trailing base64 padding bytes (which a lenient decoder may discard,
        # leaving the underlying bytes — and the Fernet HMAC — unchanged).
        mid = len(ct) // 2
        bad = ct[:mid] + ("A" if ct[mid] != "A" else "B") + ct[mid + 1:]
        with pytest.raises(InvalidToken):
            decrypt_pii(
                bad,
                secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
            )


# ---------------------------------------------------------------------------
# Stability — guards against silent HKDF derivation drift
# ---------------------------------------------------------------------------


# A literal ciphertext produced ONCE with the _FIXED_* parameters above.
# This is the regression contract: any future change to HKDF derivation,
# Fernet construction, or argument-order semantics that would silently
# invalidate existing PII columns will fail to decrypt this fixture.
# DO NOT regenerate this value casually — only at intentional, audited
# key-format migrations (and then in lockstep with a re-encryption pass
# over every PII row in production).
_FIXED_KNOWN_CIPHERTEXT = (
    "gAAAAABp8k81eepNSOopnH9NH77FwDSQEXT3x5pahWgicp2boMFWDgSZTAE8OnW-"
    "C_x50kDxeqoT20JNazNxJudL7DImEl4_Ja5p6K_3nh8YogRG5cuJ53I="
)


class TestStabilityFixture:
    """Pins a known-good ciphertext for a fixed (key, salt, info, plaintext).

    Fernet ciphertext is non-deterministic (random IV + timestamp), so we
    can't pin the encrypt side with a literal. But DECRYPTION of a literal
    ciphertext is fully stable — and that's what protects production rows.
    Future refactors that silently change the HKDF derivation will break
    this test instead of the production database."""

    def test_known_ciphertext_still_decrypts(self) -> None:
        back = decrypt_pii(
            _FIXED_KNOWN_CIPHERTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert back == _FIXED_PLAINTEXT

    def test_freshly_encrypted_value_round_trips(self) -> None:
        """Belt-and-suspenders: encrypt-then-decrypt with the same params
        always works. Catches regressions that break encrypt without
        breaking decrypt."""
        ct = encrypt_pii(
            _FIXED_PLAINTEXT,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert ct is not None
        assert _FIXED_PLAINTEXT not in ct
        assert ct.startswith("gAAAAA")
        back = decrypt_pii(
            ct,
            secret_key=_FIXED_KEY, salt=_FIXED_SALT, info=_FIXED_INFO,
        )
        assert back == _FIXED_PLAINTEXT
