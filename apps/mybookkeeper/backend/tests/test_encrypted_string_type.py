"""Tests for the ``EncryptedString`` SQLAlchemy ``TypeDecorator``.

The type itself is a thin wrapper around ``encrypt_pii`` / ``decrypt_pii``
in ``core/security.py``. These tests verify:

- Round-trip: write plaintext via ORM → DB stores ciphertext → read returns plaintext
- Cross-row independence: two rows with the same plaintext have different ciphertexts
- NULL handling: ``None`` round-trips as ``None``
- Tampered ciphertext raises a clear ``ValueError`` (rather than ``InvalidToken``)
- Non-string bind values raise ``TypeError`` with a clear message

These tests use ``Inquiry`` as the carrier model (the first model to use
``EncryptedString``) so we're also implicitly verifying that the type works
correctly inside a real ORM mapping.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encrypted_string_type import EncryptedString
from app.core.security import encrypt_pii
from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.user.user import User


def _build_inquiry(
    *, org_id: uuid.UUID, user_id: uuid.UUID,
    inquirer_email: str | None = None, inquirer_name: str | None = None,
) -> Inquiry:
    return Inquiry(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        listing_id=None,
        source="direct",
        external_inquiry_id=None,
        inquirer_name=inquirer_name,
        inquirer_email=inquirer_email,
        inquirer_phone=None,
        inquirer_employer=None,
        stage="new",
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )


class TestEncryptedStringRoundTrip:
    @pytest.mark.asyncio
    async def test_plaintext_round_trips_via_orm(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext = "applicant.nurse@example.com"
        inquiry = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=plaintext,
        )
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        assert inquiry.inquirer_email == plaintext

    @pytest.mark.asyncio
    async def test_db_stores_ciphertext_not_plaintext(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext = "secret-pii@example.com"
        inquiry = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=plaintext,
        )
        db.add(inquiry)
        await db.commit()

        # Bypass the TypeDecorator by reading the column as raw text.
        # We can't filter by UUID because SQLite stores it as 32-char hex
        # without dashes, so just read the only row's column.
        raw = await db.execute(text("SELECT inquirer_email FROM inquiries"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored
        assert stored.startswith("gAAAAA"), f"expected Fernet ciphertext, got {stored[:20]!r}"

    @pytest.mark.asyncio
    async def test_two_rows_same_plaintext_have_different_ciphertext(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext = "shared@example.com"
        a = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=plaintext,
        )
        b = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=plaintext,
        )
        db.add_all([a, b])
        await db.commit()

        # SQLite UUID handling differs from Postgres — fetch all rows and
        # collect ciphertexts by row order (stable insert order).
        raw = await db.execute(
            text("SELECT inquirer_email FROM inquiries"),
        )
        ciphertexts = [row.inquirer_email for row in raw]
        assert len(ciphertexts) == 2
        assert ciphertexts[0] != ciphertexts[1], (
            "Fernet should generate non-deterministic ciphertext for same plaintext"
        )
        # Plaintext round-trip is the same.
        await db.refresh(a)
        await db.refresh(b)
        assert a.inquirer_email == plaintext
        assert b.inquirer_email == plaintext

    @pytest.mark.asyncio
    async def test_null_round_trips(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=None,
        )
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        assert inquiry.inquirer_email is None

    @pytest.mark.asyncio
    async def test_key_version_default_is_one(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email="x@example.com",
        )
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        assert inquiry.key_version == 1


class TestEncryptedStringErrorPaths:
    def test_process_bind_param_rejects_non_string(self) -> None:
        et = EncryptedString(255)
        with pytest.raises(TypeError, match="EncryptedString expected str"):
            et.process_bind_param(12345, dialect=None)  # type: ignore[arg-type]

    def test_process_bind_param_passes_through_none(self) -> None:
        et = EncryptedString(255)
        assert et.process_bind_param(None, dialect=None) is None  # type: ignore[arg-type]

    def test_process_result_value_passes_through_none(self) -> None:
        et = EncryptedString(255)
        assert et.process_result_value(None, dialect=None) is None  # type: ignore[arg-type]

    def test_tampered_ciphertext_raises_value_error(self) -> None:
        et = EncryptedString(255)
        # Encrypt a known plaintext, then tamper with the trailing char.
        good = encrypt_pii("hello")
        bad = good[:-2] + ("A" if good[-2] != "A" else "B") + good[-1]
        with pytest.raises(ValueError, match="Failed to decrypt EncryptedString"):
            et.process_result_value(bad, dialect=None)  # type: ignore[arg-type]

    def test_round_trip_via_module_helpers(self) -> None:
        """Sanity check: encrypt_pii + decrypt_pii agree."""
        et = EncryptedString(255)
        for plaintext in ["a", "alice@example.com", "1234567890" * 20]:
            ct = et.process_bind_param(plaintext, dialect=None)  # type: ignore[arg-type]
            assert ct is not None
            assert ct != plaintext
            back = et.process_result_value(ct, dialect=None)  # type: ignore[arg-type]
            assert back == plaintext


class TestEncryptedStringCoexistsWithOAuthEncryption:
    """Verifies the EncryptedString refactor does NOT break the OAuth-token
    encryption used by the Integration model — the two key families must
    remain isolated (different HKDF info strings)."""

    @pytest.mark.asyncio
    async def test_oauth_tokens_still_encrypt_and_decrypt(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        from app.models.integrations.integration import Integration

        plaintext_token = "ya29.coexist-check"
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_coexist_test",
            token_expiry=_dt.datetime.now(_dt.timezone.utc),
        )
        integration.access_token = plaintext_token
        db.add(integration)
        await db.commit()
        await db.refresh(integration)
        assert integration.access_token == plaintext_token
        # Stored value must still be ciphertext (not the plaintext, not "***").
        assert integration.access_token_encrypted != plaintext_token

    @pytest.mark.asyncio
    async def test_pii_and_oauth_use_different_keys(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Encrypting the same plaintext via the PII helper and the OAuth
        token helper produces ciphertexts that don't decrypt with the wrong
        key — proving the HKDF `info` parameter does isolate them."""
        from app.core.security import encrypt_pii, encrypt_token, get_fernet
        from cryptography.fernet import InvalidToken

        plaintext = "shared-secret-xyz"
        oauth_ct = encrypt_token(plaintext)
        pii_ct = encrypt_pii(plaintext)

        # OAuth ciphertext should NOT decrypt with the PII helper.
        from app.core.security import decrypt_pii
        with pytest.raises(InvalidToken):
            decrypt_pii(oauth_ct)

        # And vice versa: PII ciphertext should NOT decrypt with the OAuth Fernet.
        with pytest.raises(InvalidToken):
            get_fernet().decrypt(pii_ct.encode())


class TestEncryptedStringQueryByPlaintext:
    """Equality lookups on encrypted columns are intentionally NOT supported
    (Fernet ciphertext is non-deterministic). This test documents that
    behavior so future devs don't try to `WHERE inquirer_email = ...`."""

    @pytest.mark.asyncio
    async def test_equality_filter_on_plaintext_does_not_match(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext = "queryable@example.com"
        inquiry = _build_inquiry(
            org_id=test_org.id, user_id=test_user.id, inquirer_email=plaintext,
        )
        db.add(inquiry)
        await db.commit()

        # A naive WHERE inquirer_email = '<plaintext>' won't match because
        # the DB column stores ciphertext.
        result = await db.execute(
            select(Inquiry).where(Inquiry.inquirer_email == plaintext),
        )
        # SQLAlchemy will encrypt the bind value on its way through, but
        # the ciphertext is non-deterministic so it won't match the row's
        # ciphertext. Document the expected behavior — no rows.
        assert result.scalar_one_or_none() is None
