"""Tests for TOTP service business logic.

Exercises every function in app/services/user/totp_service.py with
real pyotp calls -- no mocked TOTP codes.
"""
import hashlib
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pyotp
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User
from app.services.user import totp_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    *,
    totp_enabled: bool = False,
    totp_secret: str | None = None,
    totp_recovery_codes: str | None = None,
    email: str = "user@example.com",
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=totp_enabled,
        totp_secret=totp_secret,
        totp_recovery_codes=totp_recovery_codes,
    )
    return user


def _encrypt_for_user(value: str, user_id: uuid.UUID) -> str:
    return totp_service._encrypt(value, user_id)


def _setup_user_with_totp(user: User) -> str:
    """Encrypt a fresh TOTP secret onto the user, return the plaintext secret."""
    secret = pyotp.random_base32()
    user.totp_secret = _encrypt_for_user(secret, user.id)
    return secret


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Redirect unit_of_work and AsyncSessionLocal to the test DB session."""
    @asynccontextmanager
    async def _fake_session():
        yield db
        await db.flush()

    with (
        patch("app.services.user.totp_service.unit_of_work", _fake_session),
        patch("app.services.user.totp_service.AsyncSessionLocal", _fake_session),
    ):
        yield


# ---------------------------------------------------------------------------
# Unit tests -- pure functions (no DB)
# ---------------------------------------------------------------------------

class TestGenerateSecret:
    def test_returns_base32_string(self) -> None:
        secret = totp_service.generate_secret()
        assert isinstance(secret, str)
        assert len(secret) >= 16

    def test_each_call_returns_unique_secret(self) -> None:
        secrets = {totp_service.generate_secret() for _ in range(10)}
        assert len(secrets) == 10


class TestGetProvisioningUri:
    def test_contains_email_and_issuer(self) -> None:
        secret = pyotp.random_base32()
        uri = totp_service.get_provisioning_uri(secret, "alice@example.com")
        assert "alice%40example.com" in uri or "alice@example.com" in uri
        assert "MyBookkeeper" in uri

    def test_otpauth_scheme(self) -> None:
        secret = pyotp.random_base32()
        uri = totp_service.get_provisioning_uri(secret, "alice@example.com")
        assert uri.startswith("otpauth://totp/")


class TestVerifyCode:
    def test_current_code_is_valid(self) -> None:
        # verify_code defaults to sha256; generate the code with sha256 to match
        secret = pyotp.random_base32()
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        assert totp_service.verify_code(secret, code) is True

    def test_wrong_code_is_invalid(self) -> None:
        secret = pyotp.random_base32()
        assert totp_service.verify_code(secret, "000000") is False

    def test_empty_code_is_invalid(self) -> None:
        secret = pyotp.random_base32()
        assert totp_service.verify_code(secret, "") is False

    def test_wrong_secret_rejects_valid_code(self) -> None:
        secret_a = pyotp.random_base32()
        secret_b = pyotp.random_base32()
        code = pyotp.TOTP(secret_a).now()
        assert totp_service.verify_code(secret_b, code) is False


class TestGenerateRecoveryCodes:
    def test_returns_eight_codes_by_default(self) -> None:
        codes = totp_service.generate_recovery_codes()
        assert len(codes) == 8

    def test_custom_count(self) -> None:
        codes = totp_service.generate_recovery_codes(count=4)
        assert len(codes) == 4

    def test_codes_are_uppercase_hex(self) -> None:
        codes = totp_service.generate_recovery_codes()
        for code in codes:
            assert len(code) == 8
            assert code == code.upper()

    def test_codes_are_unique(self) -> None:
        codes = totp_service.generate_recovery_codes(count=8)
        assert len(set(codes)) == 8


class TestVerifyRecoveryCode:
    def test_valid_code_returns_true_and_removes_code(self) -> None:
        codes = ["AABBCCDD", "11223344", "DEADBEEF"]
        stored = ",".join(codes)
        valid, remaining = totp_service.verify_recovery_code(stored, "AABBCCDD")
        assert valid is True
        assert "AABBCCDD" not in (remaining or "").split(",")

    def test_invalid_code_returns_false_and_preserves_all_codes(self) -> None:
        stored = "AABBCCDD,11223344"
        valid, remaining = totp_service.verify_recovery_code(stored, "XXXXXXXX")
        assert valid is False
        assert remaining == stored

    def test_none_stored_codes_returns_false(self) -> None:
        valid, remaining = totp_service.verify_recovery_code(None, "AABBCCDD")
        assert valid is False
        assert remaining is None

    def test_empty_stored_codes_returns_false(self) -> None:
        valid, remaining = totp_service.verify_recovery_code("", "AABBCCDD")
        assert valid is False

    def test_case_insensitive_match(self) -> None:
        stored = "AABBCCDD"
        valid, _ = totp_service.verify_recovery_code(stored, "aabbccdd")
        assert valid is True

    def test_leading_trailing_whitespace_stripped(self) -> None:
        stored = "AABBCCDD"
        valid, _ = totp_service.verify_recovery_code(stored, "  AABBCCDD  ")
        assert valid is True

    def test_last_code_used_returns_none_for_remaining(self) -> None:
        stored = "AABBCCDD"
        valid, remaining = totp_service.verify_recovery_code(stored, "AABBCCDD")
        assert valid is True
        assert remaining is None

    def test_second_use_of_same_code_fails(self) -> None:
        stored = "AABBCCDD,11223344"
        _, remaining = totp_service.verify_recovery_code(stored, "AABBCCDD")
        valid, _ = totp_service.verify_recovery_code(remaining, "AABBCCDD")
        assert valid is False


class TestEncryptDecryptRoundtrip:
    def test_roundtrip_preserves_value(self) -> None:
        user_id = uuid.uuid4()
        plaintext = "MYSECRET123"
        encrypted = totp_service._encrypt(plaintext, user_id)
        decrypted = totp_service._decrypt(encrypted, user_id)
        assert decrypted == plaintext

    def test_different_users_produce_different_ciphertext(self) -> None:
        uid_a = uuid.uuid4()
        uid_b = uuid.uuid4()
        plaintext = "SAME_SECRET"
        enc_a = totp_service._encrypt(plaintext, uid_a)
        enc_b = totp_service._encrypt(plaintext, uid_b)
        assert enc_a != enc_b

    def test_wrong_user_id_cannot_decrypt(self) -> None:
        uid_a = uuid.uuid4()
        uid_b = uuid.uuid4()
        encrypted = totp_service._encrypt("SECRET", uid_a)
        with pytest.raises(Exception):
            totp_service._decrypt(encrypted, uid_b)


# ---------------------------------------------------------------------------
# Async service tests -- use real SQLite in-memory DB via conftest db fixture
# ---------------------------------------------------------------------------

class TestSetupTotp:
    @pytest.mark.asyncio
    async def test_returns_secret_and_uri(self, db: AsyncSession) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        secret, uri = await totp_service.setup_totp(user.id)

        assert len(secret) >= 16
        assert "otpauth://totp/" in uri
        assert "MyBookkeeper" in uri

    @pytest.mark.asyncio
    async def test_persists_encrypted_secret_on_user(self, db: AsyncSession) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        secret, _ = await totp_service.setup_totp(user.id)
        await db.refresh(user)

        assert user.totp_secret is not None
        assert user.totp_secret != secret
        assert totp_service._decrypt(user.totp_secret, user.id) == secret

    @pytest.mark.asyncio
    async def test_setup_does_not_enable_totp(self, db: AsyncSession) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        await totp_service.setup_totp(user.id)
        await db.refresh(user)

        assert user.totp_enabled is False

    @pytest.mark.asyncio
    async def test_raises_for_nonexistent_user(self, db: AsyncSession) -> None:
        with pytest.raises(ValueError, match="User not found"):
            await totp_service.setup_totp(uuid.uuid4())


class TestConfirmTotp:
    @pytest.mark.asyncio
    async def test_valid_code_enables_totp_and_returns_recovery_codes(
        self, db: AsyncSession,
    ) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        secret = _setup_user_with_totp(user)
        await db.commit()

        code = pyotp.TOTP(secret).now()
        verified, recovery_codes = await totp_service.confirm_totp(user.id, code)

        assert verified is True
        assert len(recovery_codes) == 8
        await db.refresh(user)
        assert user.totp_enabled is True

    @pytest.mark.asyncio
    async def test_wrong_code_returns_false_and_no_recovery_codes(
        self, db: AsyncSession,
    ) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        await db.commit()

        verified, recovery_codes = await totp_service.confirm_totp(user.id, "000000")

        assert verified is False
        assert recovery_codes == []

    @pytest.mark.asyncio
    async def test_wrong_code_does_not_enable_totp(self, db: AsyncSession) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        await db.commit()

        await totp_service.confirm_totp(user.id, "000000")
        await db.refresh(user)
        assert user.totp_enabled is False

    @pytest.mark.asyncio
    async def test_recovery_codes_stored_encrypted(self, db: AsyncSession) -> None:
        user = _make_user()
        db.add(user)
        await db.commit()

        secret = _setup_user_with_totp(user)
        await db.commit()

        code = pyotp.TOTP(secret).now()
        _, recovery_codes = await totp_service.confirm_totp(user.id, code)
        await db.refresh(user)

        assert user.totp_recovery_codes is not None
        assert recovery_codes[0] not in user.totp_recovery_codes

    @pytest.mark.asyncio
    async def test_no_totp_secret_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_secret=None)
        db.add(user)
        await db.commit()

        verified, _ = await totp_service.confirm_totp(user.id, "123456")
        assert verified is False

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_false(self, db: AsyncSession) -> None:
        verified, _ = await totp_service.confirm_totp(uuid.uuid4(), "123456")
        assert verified is False


class TestDisableTotp:
    @pytest.mark.asyncio
    async def test_valid_code_disables_totp_and_clears_fields(
        self, db: AsyncSession,
    ) -> None:
        user = _make_user(totp_enabled=True)
        db.add(user)
        await db.commit()

        secret = _setup_user_with_totp(user)
        user.totp_enabled = True
        await db.commit()

        code = pyotp.TOTP(secret).now()
        result = await totp_service.disable_totp(user.id, code)
        assert result is True

        await db.refresh(user)
        assert user.totp_enabled is False
        assert user.totp_secret is None
        assert user.totp_recovery_codes is None

    @pytest.mark.asyncio
    async def test_wrong_code_returns_false_and_leaves_totp_enabled(
        self, db: AsyncSession,
    ) -> None:
        user = _make_user(totp_enabled=True)
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        user.totp_enabled = True
        await db.commit()

        result = await totp_service.disable_totp(user.id, "000000")
        assert result is False
        await db.refresh(user)
        assert user.totp_enabled is True

    @pytest.mark.asyncio
    async def test_not_enabled_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=False)
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        await db.commit()

        result = await totp_service.disable_totp(user.id, "123456")
        assert result is False

    @pytest.mark.asyncio
    async def test_no_secret_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, totp_secret=None)
        db.add(user)
        await db.commit()

        result = await totp_service.disable_totp(user.id, "123456")
        assert result is False

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_false(self, db: AsyncSession) -> None:
        result = await totp_service.disable_totp(uuid.uuid4(), "123456")
        assert result is False


class TestValidateTotpForLogin:
    @pytest.mark.asyncio
    async def test_valid_totp_code_returns_true(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="login@example.com")
        db.add(user)
        await db.commit()

        secret = _setup_user_with_totp(user)
        user.totp_enabled = True
        await db.commit()

        code = pyotp.TOTP(secret).now()
        valid, used_recovery = await totp_service.validate_totp_for_login("login@example.com", code)
        assert valid is True
        assert used_recovery is False

    @pytest.mark.asyncio
    async def test_wrong_totp_code_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="wrongcode@example.com")
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        user.totp_enabled = True
        await db.commit()

        valid, used_recovery = await totp_service.validate_totp_for_login("wrongcode@example.com", "000000")
        assert valid is False
        assert used_recovery is False

    @pytest.mark.asyncio
    async def test_valid_recovery_code_returns_true(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="recovery@example.com")
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        user.totp_enabled = True
        recovery = ["AABBCCDD", "11223344"]
        user.totp_recovery_codes = _encrypt_for_user(",".join(recovery), user.id)
        await db.commit()

        valid, used_recovery = await totp_service.validate_totp_for_login("recovery@example.com", "AABBCCDD")
        assert valid is True
        assert used_recovery is True

    @pytest.mark.asyncio
    async def test_recovery_code_consumed_after_use(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="consumed@example.com")
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        user.totp_enabled = True
        recovery = ["AABBCCDD", "11223344"]
        user.totp_recovery_codes = _encrypt_for_user(",".join(recovery), user.id)
        await db.commit()

        await totp_service.validate_totp_for_login("consumed@example.com", "AABBCCDD")
        await db.refresh(user)

        valid, _ = await totp_service.validate_totp_for_login("consumed@example.com", "AABBCCDD")
        assert valid is False

    @pytest.mark.asyncio
    async def test_invalid_recovery_code_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="badrec@example.com")
        db.add(user)
        await db.commit()

        _setup_user_with_totp(user)
        user.totp_enabled = True
        user.totp_recovery_codes = _encrypt_for_user("AABBCCDD", user.id)
        await db.commit()

        valid, used_recovery = await totp_service.validate_totp_for_login("badrec@example.com", "XXXXXXXX")
        assert valid is False
        assert used_recovery is False

    @pytest.mark.asyncio
    async def test_totp_not_enabled_returns_false(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=False, email="notenabled@example.com")
        db.add(user)
        await db.commit()

        secret = _setup_user_with_totp(user)
        await db.commit()

        code = pyotp.TOTP(secret).now()
        valid, used_recovery = await totp_service.validate_totp_for_login("notenabled@example.com", code)
        assert valid is False
        assert used_recovery is False

    @pytest.mark.asyncio
    async def test_unknown_email_returns_false(self, db: AsyncSession) -> None:
        valid, used_recovery = await totp_service.validate_totp_for_login("ghost@example.com", "123456")
        assert valid is False
        assert used_recovery is False


class TestIsTotpRequired:
    @pytest.mark.asyncio
    async def test_returns_true_when_totp_enabled(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=True, email="enabled@example.com")
        db.add(user)
        await db.commit()

        result = await totp_service.is_totp_required("enabled@example.com")
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_totp_disabled(self, db: AsyncSession) -> None:
        user = _make_user(totp_enabled=False, email="disabled@example.com")
        db.add(user)
        await db.commit()

        result = await totp_service.is_totp_required("disabled@example.com")
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_for_unknown_email(self, db: AsyncSession) -> None:
        result = await totp_service.is_totp_required("nobody@example.com")
        assert result is False


# ---------------------------------------------------------------------------
# SHA-256 algorithm migration (audit 2026-05-02)
# ---------------------------------------------------------------------------

class TestSetupTotpAlgorithm:
    """setup_totp writes totp_algorithm = 'sha256' for all new enrollments."""

    @pytest.mark.asyncio
    async def test_setup_writes_sha256_algorithm(self, db: AsyncSession) -> None:
        user = _make_user(email="sha256setup@example.com")
        db.add(user)
        await db.commit()

        await totp_service.setup_totp(user.id)
        await db.refresh(user)

        assert user.totp_algorithm == "sha256"

    @pytest.mark.asyncio
    async def test_setup_uri_contains_algorithm_sha256(self, db: AsyncSession) -> None:
        user = _make_user(email="sha256uri@example.com")
        db.add(user)
        await db.commit()

        _, uri = await totp_service.setup_totp(user.id)

        assert "algorithm=SHA256" in uri


class TestGrandfatheredSha1Users:
    """Existing SHA-1 users (totp_algorithm='sha1') continue to work after the migration."""

    def _make_sha1_user(self, email: str = "sha1user@example.com") -> tuple["User", str]:
        """Return a user with SHA-1 TOTP and the plaintext secret."""
        user = _make_user(totp_enabled=True, email=email)
        secret = pyotp.random_base32()
        user.totp_secret = _encrypt_for_user(secret, user.id)
        # Leave totp_algorithm at default 'sha1' (model default = 'sha1')
        return user, secret

    @pytest.mark.asyncio
    async def test_sha1_user_can_confirm_totp(self, db: AsyncSession) -> None:
        """A user with totp_algorithm='sha1' can confirm their TOTP code."""
        user, secret = self._make_sha1_user(email="sha1confirm@example.com")
        user.totp_enabled = False  # not yet enabled — about to confirm
        db.add(user)
        await db.commit()

        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        verified, recovery_codes = await totp_service.confirm_totp(user.id, code)

        assert verified is True
        assert len(recovery_codes) == 8

    @pytest.mark.asyncio
    async def test_sha1_user_can_login(self, db: AsyncSession) -> None:
        """A user with totp_algorithm='sha1' can log in with a SHA-1 TOTP code."""
        user, secret = self._make_sha1_user(email="sha1login@example.com")
        db.add(user)
        await db.commit()

        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        valid, used_recovery = await totp_service.validate_totp_for_login(
            "sha1login@example.com", code
        )

        assert valid is True
        assert used_recovery is False

    @pytest.mark.asyncio
    async def test_sha1_user_can_disable_totp(self, db: AsyncSession) -> None:
        """A user with totp_algorithm='sha1' can disable TOTP with a SHA-1 code."""
        user, secret = self._make_sha1_user(email="sha1disable@example.com")
        db.add(user)
        await db.commit()

        code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        result = await totp_service.disable_totp(user.id, code)

        assert result is True
        await db.refresh(user)
        assert user.totp_enabled is False
        assert user.totp_secret is None


class TestReEnrollmentUpgradesAlgorithm:
    """After disable + re-enroll, the user's algorithm becomes sha256."""

    @pytest.mark.asyncio
    async def test_reenrollment_after_disable_uses_sha256(self, db: AsyncSession) -> None:
        """disable_totp + setup_totp results in totp_algorithm='sha256'."""
        # Start as a SHA-1 grandfathered user
        user = _make_user(totp_enabled=True, email="reenroll@example.com")
        secret = pyotp.random_base32()
        user.totp_secret = _encrypt_for_user(secret, user.id)
        # totp_algorithm stays 'sha1' (model default)
        db.add(user)
        await db.commit()

        # Disable with SHA-1 code
        sha1_code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        disabled = await totp_service.disable_totp(user.id, sha1_code)
        assert disabled is True
        await db.refresh(user)
        assert user.totp_algorithm == "sha1"  # reset to default after disable

        # Re-enroll — setup_totp always writes sha256
        new_secret, new_uri = await totp_service.setup_totp(user.id)
        await db.refresh(user)

        assert user.totp_algorithm == "sha256"
        assert "algorithm=SHA256" in new_uri

        # The new enrollment verifies with SHA-256
        sha256_code = pyotp.TOTP(new_secret, digest=hashlib.sha256).now()
        verified, _ = await totp_service.confirm_totp(user.id, sha256_code)
        assert verified is True


class TestNewUserEnrollmentEndToEnd:
    """Full new-user enrollment: setup → confirm → login, all with SHA-256."""

    @pytest.mark.asyncio
    async def test_full_sha256_flow(self, db: AsyncSession) -> None:
        """New user goes through setup → confirm → login with SHA-256."""
        user = _make_user(email="newsha256@example.com")
        db.add(user)
        await db.commit()

        # 1. Setup: returns a secret and URI with SHA-256 in the URI
        secret, uri = await totp_service.setup_totp(user.id)
        assert "algorithm=SHA256" in uri
        await db.refresh(user)
        assert user.totp_algorithm == "sha256"

        # 2. Confirm: SHA-256 code must verify
        code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        verified, recovery_codes = await totp_service.confirm_totp(user.id, code)
        assert verified is True
        assert len(recovery_codes) == 8

        # 3. Login: SHA-256 code accepted
        login_code = pyotp.TOTP(secret, digest=hashlib.sha256).now()
        valid, used_recovery = await totp_service.validate_totp_for_login(
            "newsha256@example.com", login_code
        )
        assert valid is True
        assert used_recovery is False

        # 4. Confirm SHA-1 code is rejected for this new SHA-256 user
        sha1_code = pyotp.TOTP(secret, digest=hashlib.sha1).now()
        # Only run this assertion if the codes differ (they usually do)
        if sha1_code != login_code:
            valid_sha1, _ = await totp_service.validate_totp_for_login(
                "newsha256@example.com", sha1_code
            )
            assert valid_sha1 is False
