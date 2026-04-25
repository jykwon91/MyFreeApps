"""Verify that OAuth tokens on the Integration model are encrypted at rest.

These tests use the SQLite in-memory fixture from conftest. They confirm:
- access_token and refresh_token are encrypted before persistence
- Reading access_token / refresh_token via the hybrid property round-trips correctly
- NULL / empty tokens are handled gracefully
- The raw encrypted column does not contain the plaintext secret
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User


class TestIntegrationTokenEncryption:
    """Hybrid property encrypts on write and decrypts on read."""

    @pytest.mark.asyncio
    async def test_access_token_is_not_stored_as_plaintext(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        plaintext = "ya29.plaintext-access-token-secret-value"
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = plaintext
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        # access_token_encrypted is the raw column — read it directly to confirm
        # the stored value is not the plaintext string.
        stored: str | None = integration.access_token_encrypted

        assert stored is not None
        assert plaintext not in stored

    @pytest.mark.asyncio
    async def test_access_token_round_trips(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        plaintext = "ya29.round-trip-access-token"
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test2",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = plaintext
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        assert integration.access_token == plaintext

    @pytest.mark.asyncio
    async def test_refresh_token_is_not_stored_as_plaintext(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        plaintext_refresh = "1//refresh-token-secret-value"
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test3",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = "ya29.access"
        integration.refresh_token = plaintext_refresh
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        stored: str | None = integration.refresh_token_encrypted

        assert stored is not None
        assert plaintext_refresh not in stored

    @pytest.mark.asyncio
    async def test_refresh_token_round_trips(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        plaintext_refresh = "1//refresh-round-trip"
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test4",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = "ya29.access"
        integration.refresh_token = plaintext_refresh
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        assert integration.refresh_token == plaintext_refresh

    @pytest.mark.asyncio
    async def test_null_access_token_is_handled_gracefully(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test5",
            token_expiry=datetime.now(timezone.utc),
        )
        # Leave access_token unset (None)
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        assert integration.access_token is None
        assert integration.access_token_encrypted is None

    @pytest.mark.asyncio
    async def test_null_refresh_token_is_handled_gracefully(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test6",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = "ya29.access"
        # Leave refresh_token unset (None)
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        assert integration.refresh_token is None
        assert integration.refresh_token_encrypted is None

    @pytest.mark.asyncio
    async def test_encrypted_column_has_fernet_prefix(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Fernet ciphertext always begins with 'gAAAAA' (version byte in base64url)."""
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test7",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = "ya29.fernet-prefix-check"
        db.add(integration)
        await db.flush()
        await db.refresh(integration)

        stored: str | None = integration.access_token_encrypted
        assert stored is not None
        assert stored.startswith("gAAAAA"), (
            f"Expected Fernet ciphertext starting with 'gAAAAA', got: {stored[:20]!r}"
        )

    @pytest.mark.asyncio
    async def test_setting_access_token_via_setter_updates_encrypted_column(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_test8",
            token_expiry=datetime.now(timezone.utc),
        )
        integration.access_token = "ya29.original"
        db.add(integration)
        await db.flush()

        original_encrypted = integration.access_token_encrypted

        integration.access_token = "ya29.updated"
        await db.flush()

        assert integration.access_token_encrypted != original_encrypted
        assert integration.access_token == "ya29.updated"
