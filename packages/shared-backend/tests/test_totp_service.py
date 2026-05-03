"""Tests for ``platform_shared.services.totp_service``.

The module is pure functions — no database, no app config — so these
tests exercise the real ``pyotp`` and ``cryptography.fernet`` libraries
directly. No mocks for either: a TOTP code rejection from a faked clock
is exactly the bug we want to catch.

What's covered:
  * RFC-6238 secret format (base32, sufficient entropy)
  * provisioning URI matches the Google Authenticator key-uri spec
  * verify accepts the current code, rejects empty / wrong / cross-secret codes
  * recovery codes: format (8 uppercase hex chars), uniqueness, custom count
  * recovery-code consumption: case-insensitive, whitespace-tolerant, single-use
  * ``enroll_totp`` returns a self-consistent triple (secret -> URI -> codes)
  * per-user Fernet roundtrip + cross-user isolation
  * cross-app key isolation: codes generated under master key A do NOT
    decrypt under master key B (the reason this service is decoupled
    from any single app's config)
  * SHA-256 algorithm selection (audit 2026-05-02):
    - default algorithm for new enrollments is sha256
    - sha256 verify_code works with pyotp SHA-256 TOTP
    - sha1 verify_code still works for grandfathered users
    - algorithm mismatch rejects valid codes
    - provisioning URI includes algorithm=SHA256 for sha256
    - _digest_for rejects unknown algorithm strings
"""
import hashlib
import secrets as _secrets
import uuid

import pyotp
import pytest
from cryptography.fernet import InvalidToken

from platform_shared.services import totp_service
from platform_shared.services.totp_service import (
    DEFAULT_RECOVERY_CODE_COUNT,
    DEFAULT_TOTP_ALGORITHM,
    decrypt_for_user,
    encrypt_for_user,
    enroll_totp,
    generate_recovery_codes,
    generate_secret,
    get_provisioning_uri,
    make_user_fernet,
    verify_code,
    verify_recovery_code,
)


# ---------------------------------------------------------------------------
# generate_secret
# ---------------------------------------------------------------------------

class TestGenerateSecret:
    def test_returns_base32_string(self) -> None:
        secret = generate_secret()
        assert isinstance(secret, str)
        # ``pyotp.random_base32()`` defaults to a 32-char alphabet, but the
        # contract is ≥16 chars (RFC 4226 §4 recommends ≥128 bits ≈ 26 b32 chars).
        assert len(secret) >= 16
        # Every character must be in the base32 alphabet.
        assert set(secret).issubset(set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"))

    def test_each_call_returns_unique_secret(self) -> None:
        secrets_seen = {generate_secret() for _ in range(20)}
        assert len(secrets_seen) == 20  # collision probability ≈ 0


# ---------------------------------------------------------------------------
# get_provisioning_uri
# ---------------------------------------------------------------------------

class TestGetProvisioningUri:
    def test_otpauth_scheme(self) -> None:
        uri = get_provisioning_uri(generate_secret(), "alice@example.com", issuer="MyApp")
        assert uri.startswith("otpauth://totp/")

    def test_contains_label_and_issuer(self) -> None:
        uri = get_provisioning_uri(generate_secret(), "alice@example.com", issuer="MyApp")
        assert "alice%40example.com" in uri or "alice@example.com" in uri
        assert "MyApp" in uri

    def test_issuer_kwarg_is_required(self) -> None:
        with pytest.raises(TypeError):
            get_provisioning_uri(generate_secret(), "alice@example.com")  # type: ignore[call-arg]

    def test_different_issuers_produce_different_uris(self) -> None:
        secret = generate_secret()
        uri_a = get_provisioning_uri(secret, "alice@example.com", issuer="AppA")
        uri_b = get_provisioning_uri(secret, "alice@example.com", issuer="AppB")
        assert uri_a != uri_b
        assert "AppA" in uri_a and "AppA" not in uri_b

    def test_default_algorithm_is_sha256(self) -> None:
        """The default algorithm for new enrollments is sha256 per the 2026-05-02 audit."""
        assert DEFAULT_TOTP_ALGORITHM == "sha256"

    def test_sha256_uri_includes_algorithm_param(self) -> None:
        uri = get_provisioning_uri(generate_secret(), "alice@example.com", issuer="MyApp", algorithm="sha256")
        assert "algorithm=SHA256" in uri

    def test_sha1_uri_does_not_include_algorithm_param(self) -> None:
        # SHA-1 is the RFC default — pyotp omits the parameter for SHA-1 URIs,
        # which is correct per the key-uri spec. Authenticator apps that don't
        # support the parameter (Google Authenticator) default to SHA-1 anyway.
        uri = get_provisioning_uri(generate_secret(), "alice@example.com", issuer="MyApp", algorithm="sha1")
        assert "algorithm=SHA256" not in uri  # not sha256
        assert uri.startswith("otpauth://totp/")


# ---------------------------------------------------------------------------
# verify_code
# ---------------------------------------------------------------------------

class TestVerifyCode:
    def test_current_code_sha256_is_valid(self) -> None:
        """Default (sha256) verify_code accepts a code generated by SHA-256 TOTP."""
        secret = generate_secret()
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert verify_code(secret, code) is True

    def test_current_code_sha1_is_valid(self) -> None:
        """SHA-1 verify_code accepts a code generated by SHA-1 TOTP (grandfathered)."""
        secret = generate_secret()
        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        assert verify_code(secret, code, algorithm="sha1") is True

    def test_wrong_code_is_invalid(self) -> None:
        assert verify_code(generate_secret(), "000000") is False

    def test_empty_code_is_invalid(self) -> None:
        # Important: pyotp will raise on empty input if we forward it, so
        # the wrapper short-circuits to False instead.
        assert verify_code(generate_secret(), "") is False

    def test_wrong_secret_rejects_valid_code(self) -> None:
        secret_a = generate_secret()
        secret_b = generate_secret()
        code = pyotp.TOTP(secret_a, digest=hashlib.sha256).now()
        assert verify_code(secret_b, code) is False

    def test_non_numeric_code_is_invalid(self) -> None:
        assert verify_code(generate_secret(), "abcdef") is False

    def test_algorithm_mismatch_rejects_valid_code(self) -> None:
        """A SHA-1 code does NOT verify against a SHA-256 verifier, and vice versa.

        This is the key behaviour that prevents grandfathered users from
        being accidentally verified with the wrong algorithm — the column
        value drives the verifier, not just the URI.
        """
        secret = generate_secret()
        sha1_code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        sha256_code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        # SHA-1 code checked against SHA-256 verifier: wrong
        assert verify_code(secret, sha1_code, algorithm="sha256") is False
        # SHA-256 code checked against SHA-1 verifier: wrong
        assert verify_code(secret, sha256_code, algorithm="sha1") is False


# ---------------------------------------------------------------------------
# generate_recovery_codes
# ---------------------------------------------------------------------------

class TestGenerateRecoveryCodes:
    def test_default_count_matches_constant(self) -> None:
        codes = generate_recovery_codes()
        assert len(codes) == DEFAULT_RECOVERY_CODE_COUNT == 8

    def test_custom_count(self) -> None:
        codes = generate_recovery_codes(count=4)
        assert len(codes) == 4

    def test_codes_are_eight_uppercase_hex_chars(self) -> None:
        for code in generate_recovery_codes():
            assert len(code) == 8
            assert code == code.upper()
            assert all(c in "0123456789ABCDEF" for c in code)

    def test_codes_are_unique_within_a_batch(self) -> None:
        codes = generate_recovery_codes(count=8)
        assert len(set(codes)) == 8

    def test_zero_count_returns_empty_list(self) -> None:
        # Edge case: a caller with a custom recovery-code count of 0 should
        # get an empty list, not an error. This is unusual but valid.
        assert generate_recovery_codes(count=0) == []


# ---------------------------------------------------------------------------
# verify_recovery_code
# ---------------------------------------------------------------------------

class TestVerifyRecoveryCode:
    def test_valid_code_returns_true_and_removes_code(self) -> None:
        stored = "AABBCCDD,11223344,DEADBEEF"
        valid, remaining = verify_recovery_code(stored, "AABBCCDD")
        assert valid is True
        assert "AABBCCDD" not in (remaining or "").split(",")

    def test_invalid_code_returns_false_and_preserves_all_codes(self) -> None:
        stored = "AABBCCDD,11223344"
        valid, remaining = verify_recovery_code(stored, "XXXXXXXX")
        assert valid is False
        assert remaining == stored

    def test_none_stored_returns_false(self) -> None:
        valid, remaining = verify_recovery_code(None, "AABBCCDD")
        assert valid is False
        assert remaining is None

    def test_empty_stored_returns_false(self) -> None:
        valid, _ = verify_recovery_code("", "AABBCCDD")
        assert valid is False

    def test_case_insensitive(self) -> None:
        valid, _ = verify_recovery_code("AABBCCDD", "aabbccdd")
        assert valid is True

    def test_strips_whitespace(self) -> None:
        valid, _ = verify_recovery_code("AABBCCDD", "  AABBCCDD  ")
        assert valid is True

    def test_last_code_consumed_returns_none(self) -> None:
        valid, remaining = verify_recovery_code("AABBCCDD", "AABBCCDD")
        assert valid is True
        assert remaining is None

    def test_second_use_of_same_code_fails(self) -> None:
        stored = "AABBCCDD,11223344"
        _, remaining = verify_recovery_code(stored, "AABBCCDD")
        valid, _ = verify_recovery_code(remaining, "AABBCCDD")
        assert valid is False


# ---------------------------------------------------------------------------
# enroll_totp — bundle convenience
# ---------------------------------------------------------------------------

class TestEnrollTotp:
    def test_returns_self_consistent_triple_sha256(self) -> None:
        """Default enrollment uses SHA-256; verify_code must accept the generated code."""
        secret, uri, recovery_codes = enroll_totp(label="user@example.com", issuer="MyApp")
        # Secret round-trips through the URI.
        assert secret in uri
        # Issuer round-trips through the URI.
        assert "MyApp" in uri
        # The current code for the returned secret verifies (SHA-256 by default).
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert verify_code(secret, code) is True
        # Default count.
        assert len(recovery_codes) == DEFAULT_RECOVERY_CODE_COUNT

    def test_returns_self_consistent_triple_sha1(self) -> None:
        """Explicit sha1 enrollment: verify_code with algorithm='sha1' must accept the code."""
        secret, uri, recovery_codes = enroll_totp(
            label="user@example.com", issuer="MyApp", algorithm="sha1"
        )
        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        assert verify_code(secret, code, algorithm="sha1") is True

    def test_sha256_enrollment_uri_includes_algorithm_param(self) -> None:
        """SHA-256 enrollments embed algorithm=SHA256 in the otpauth URI."""
        _, uri, _ = enroll_totp(label="user@example.com", issuer="MyApp", algorithm="sha256")
        assert "algorithm=SHA256" in uri

    def test_sha1_enrollment_uri_has_no_algorithm_param(self) -> None:
        """SHA-1 is the RFC default — pyotp omits the algorithm parameter for SHA-1 URIs."""
        _, uri, _ = enroll_totp(label="user@example.com", issuer="MyApp", algorithm="sha1")
        # pyotp only adds algorithm= for non-default (sha256/sha512) values
        assert "algorithm=SHA256" not in uri
        assert uri.startswith("otpauth://totp/")

    def test_custom_recovery_code_count(self) -> None:
        _, _, recovery_codes = enroll_totp(
            label="user@example.com",
            issuer="MyApp",
            recovery_code_count=3,
        )
        assert len(recovery_codes) == 3

    def test_each_enrollment_is_independent(self) -> None:
        s1, u1, r1 = enroll_totp(label="a@example.com", issuer="MyApp")
        s2, u2, r2 = enroll_totp(label="a@example.com", issuer="MyApp")
        assert s1 != s2
        assert u1 != u2
        # Recovery codes should also be unique across enrollments (16 hex
        # chars of entropy each — collision is astronomically unlikely).
        assert set(r1).isdisjoint(set(r2))


# ---------------------------------------------------------------------------
# Per-user Fernet roundtrip
# ---------------------------------------------------------------------------

class TestPerUserFernet:
    def test_roundtrip_preserves_value(self) -> None:
        master = _secrets.token_urlsafe(32)
        user_id = uuid.uuid4()
        plaintext = "MYSECRET123"
        encrypted = encrypt_for_user(plaintext, master, user_id)
        assert encrypted != plaintext  # ciphertext, not plaintext
        assert decrypt_for_user(encrypted, master, user_id) == plaintext

    def test_different_users_produce_different_ciphertext(self) -> None:
        master = _secrets.token_urlsafe(32)
        plaintext = "SAME_SECRET"
        enc_a = encrypt_for_user(plaintext, master, uuid.uuid4())
        enc_b = encrypt_for_user(plaintext, master, uuid.uuid4())
        assert enc_a != enc_b

    def test_wrong_user_id_cannot_decrypt(self) -> None:
        master = _secrets.token_urlsafe(32)
        uid_a = uuid.uuid4()
        uid_b = uuid.uuid4()
        encrypted = encrypt_for_user("SECRET", master, uid_a)
        with pytest.raises(InvalidToken):
            decrypt_for_user(encrypted, master, uid_b)

    def test_make_user_fernet_is_deterministic(self) -> None:
        master = _secrets.token_urlsafe(32)
        user_id = uuid.uuid4()
        f1 = make_user_fernet(master, user_id)
        f2 = make_user_fernet(master, user_id)
        # Two Fernet instances with the same derived key must round-trip
        # each other's ciphertext.
        token = f1.encrypt(b"hello")
        assert f2.decrypt(token) == b"hello"


# ---------------------------------------------------------------------------
# Cross-app key isolation
# ---------------------------------------------------------------------------

class TestCrossAppKeyIsolation:
    """The whole point of decoupling this service from app config is so two
    apps deployed side-by-side cannot read each other's TOTP secrets, even
    if a UUID happens to collide (which it shouldn't, but defense in depth)."""

    def test_app_a_cannot_decrypt_app_bs_ciphertext(self) -> None:
        master_a = _secrets.token_urlsafe(32)
        master_b = _secrets.token_urlsafe(32)
        # Same user UUID across both apps — the attack scenario. Decrypt
        # must still fail because the master key is different.
        user_id = uuid.uuid4()
        encrypted_under_a = encrypt_for_user("SECRET-FROM-APP-A", master_a, user_id)
        with pytest.raises(InvalidToken):
            decrypt_for_user(encrypted_under_a, master_b, user_id)

    def test_recovery_codes_generated_for_one_app_dont_match_anothers_store(self) -> None:
        """The pure API has no shared global state — recovery codes
        generated for AppA's user don't appear in AppB's store unless
        AppB explicitly persists them. This is structural, not behavioral,
        but we assert it explicitly so a future regression that introduces
        any module-level cache fails fast."""
        codes_a = generate_recovery_codes()
        codes_b = generate_recovery_codes()
        # Two batches drawn from os.urandom — overlap probability is
        # negligible (each code is 32 bits of entropy; with 8 codes each,
        # collision prob ≈ 64 / 2^32).
        assert set(codes_a).isdisjoint(set(codes_b))


# ---------------------------------------------------------------------------
# Module surface
# ---------------------------------------------------------------------------

class TestModuleSurface:
    """The public API contract. Removing any of these symbols breaks the
    M5 promotion guarantees — bump a major version + migrate every caller."""

    def test_exports_required_public_symbols(self) -> None:
        for name in (
            "generate_secret",
            "get_provisioning_uri",
            "verify_code",
            "verify_recovery_code",
            "generate_recovery_codes",
            "enroll_totp",
            "make_user_fernet",
            "encrypt_for_user",
            "decrypt_for_user",
            "VERIFY_WINDOW",
            "DEFAULT_RECOVERY_CODE_COUNT",
            # SHA-256 migration symbols (audit 2026-05-02):
            "DEFAULT_TOTP_ALGORITHM",
            "TotpAlgorithm",
        ):
            assert hasattr(totp_service, name), f"missing public symbol: {name}"

    def test_does_not_import_app_specific_modules(self) -> None:
        """Regression guard: the shared module must NEVER pull in app config.

        If this fails, the shared service has been recoupled to a single
        app's settings and the M5 decoupling has regressed.
        """
        import sys

        # Reload the module fresh to avoid contamination from other tests.
        # (In practice this always passes since the module is loaded once
        # at session start, but we want a deterministic check.)
        forbidden_prefixes = ("app.", "mybookkeeper", "myjobhunter")
        module_globals = vars(totp_service)
        for value in module_globals.values():
            module = getattr(value, "__module__", None)
            if module is None:
                continue
            for prefix in forbidden_prefixes:
                assert not module.startswith(prefix), (
                    f"shared totp_service must not depend on app-specific "
                    f"module {module}"
                )
        # Also verify no app.* modules are imported in sys.modules as a
        # side-effect of loading totp_service. (We can't undo a stray
        # import after the fact, but if the module is already loaded with
        # a stray import, this catches it.)
        for mod_name in list(sys.modules):
            if mod_name.startswith("app.") and "totp" in mod_name:
                pytest.fail(f"app-specific module leaked into sys.modules: {mod_name}")


# ---------------------------------------------------------------------------
# SHA-256 KDF migration — algorithm selection (audit 2026-05-02)
# ---------------------------------------------------------------------------

class TestAlgorithmSelection:
    """Comprehensive coverage of the grace-period algorithm selection logic.

    These tests are the regression contract for the 2026-05-02 SHA-256
    migration — they verify that:
      1. New enrollments default to SHA-256.
      2. Grandfathered SHA-1 users continue to work.
      3. Algorithm mismatch always rejects (no silent fallback).
      4. URI embeds the correct ``algorithm=`` parameter.
    """

    def test_default_algorithm_is_sha256(self) -> None:
        assert DEFAULT_TOTP_ALGORITHM == "sha256"

    def test_sha256_enroll_and_verify_roundtrip(self) -> None:
        """Full new-user flow: enroll sha256, verify with sha256."""
        secret, _, _ = enroll_totp(label="new@example.com", issuer="Test")
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert verify_code(secret, code, algorithm="sha256") is True

    def test_sha1_enroll_and_verify_roundtrip(self) -> None:
        """Grandfathered user flow: enroll sha1, verify with sha1."""
        secret, _, _ = enroll_totp(label="old@example.com", issuer="Test", algorithm="sha1")
        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        assert verify_code(secret, code, algorithm="sha1") is True

    def test_sha256_code_fails_sha1_verifier(self) -> None:
        """SHA-256 code MUST NOT verify under a SHA-1 verifier."""
        secret = generate_secret()
        sha256_code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert verify_code(secret, sha256_code, algorithm="sha1") is False

    def test_sha1_code_fails_sha256_verifier(self) -> None:
        """SHA-1 code (grandfathered) MUST NOT verify under a SHA-256 verifier."""
        secret = generate_secret()
        sha1_code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        assert verify_code(secret, sha1_code, algorithm="sha256") is False

    def test_sha256_provisioning_uri_contains_algorithm_sha256(self) -> None:
        uri = get_provisioning_uri(generate_secret(), "u@e.com", issuer="App", algorithm="sha256")
        assert "algorithm=SHA256" in uri

    def test_sha1_provisioning_uri_has_no_algorithm_param(self) -> None:
        # SHA-1 is the default per key-uri spec; pyotp omits the parameter.
        # Google Authenticator (which ignores algorithm= anyway) works fine.
        uri = get_provisioning_uri(generate_secret(), "u@e.com", issuer="App", algorithm="sha1")
        assert "algorithm=SHA256" not in uri
        assert uri.startswith("otpauth://totp/")

    def test_unsupported_algorithm_raises_value_error(self) -> None:
        secret = generate_secret()
        with pytest.raises(ValueError, match="Unsupported TOTP algorithm"):
            verify_code(secret, "123456", algorithm="sha512")  # type: ignore[arg-type]

    def test_unsupported_algorithm_in_provisioning_uri_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unsupported TOTP algorithm"):
            get_provisioning_uri(
                generate_secret(), "u@e.com", issuer="App", algorithm="sha512"  # type: ignore[arg-type]
            )

    def test_re_enrollment_upgrades_to_sha256(self) -> None:
        """After a user re-enrolls (new secret), the new enrollment is sha256.

        This is the mechanism for upgrading grandfathered users — they disable,
        then re-enable, and the new enrollment uses sha256. The old sha1 secret
        is cleared at disable time.
        """
        # Simulate a fresh enrollment (as setup_totp does after disable_totp clears the row)
        secret, _, _ = enroll_totp(label="upgraded@example.com", issuer="Test")
        # Verify code works with sha256 (the default)
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert verify_code(secret, code, algorithm="sha256") is True
        # The old sha1 code does NOT work against the new sha256 secret
        sha1_code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        assert verify_code(secret, sha1_code, algorithm="sha256") is False
