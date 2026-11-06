"""Verify that OAuth tokens on the Integration model are encrypted at rest.

These tests use the SQLite in-memory fixture from conftest. They confirm:
- access_token and refresh_token are encrypted before persistence
- Reading access_token / refresh_token via the hybrid property round-trips correctly
- NULL / empty tokens are handled gracefully
- The raw encrypted column does not contain the plaintext secret
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import integration_repo


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


class TestUpdateAccessToken:
    """integration_repo.update_access_token_if_unchanged writes a refreshed token + normalizes expiry."""

    @pytest.mark.asyncio
    async def test_persists_new_access_token_and_aware_expiry(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_refresh1",
            token_expiry=datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc),
        )
        integration.access_token = "ya29.old"
        db.add(integration)
        await db.flush()
        old_encrypted = integration.access_token_encrypted

        new_expiry = datetime(2026, 5, 13, 13, 0, 0, tzinfo=timezone.utc)
        assert await integration_repo.update_access_token_if_unchanged(db, integration, "ya29.new", new_expiry)
        await db.flush()

        assert integration.access_token == "ya29.new"
        assert integration.access_token_encrypted != old_encrypted
        assert integration.token_expiry == new_expiry

    @pytest.mark.asyncio
    async def test_normalizes_naive_expiry_to_utc(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """google-auth returns naive datetimes for expiry — repo helper must
        add UTC tzinfo so the DB stores a timezone-aware value."""
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_refresh2",
            token_expiry=datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc),
        )
        integration.access_token = "ya29.old"
        db.add(integration)
        await db.flush()

        naive_expiry = datetime(2026, 5, 13, 14, 0, 0)  # no tzinfo
        await integration_repo.update_access_token_if_unchanged(db, integration, "ya29.new", naive_expiry)
        await db.flush()

        assert integration.token_expiry is not None
        assert integration.token_expiry.tzinfo is not None
        assert integration.token_expiry == datetime(2026, 5, 13, 14, 0, 0, tzinfo=timezone.utc)

    @pytest.mark.asyncio
    async def test_accepts_none_expiry(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """If google-auth returns no expiry, the repo helper should clear it."""
        integration = Integration(
            organization_id=test_org.id,
            user_id=test_user.id,
            provider="gmail_refresh3",
            token_expiry=datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc),
        )
        integration.access_token = "ya29.old"
        db.add(integration)
        await db.flush()

        await integration_repo.update_access_token_if_unchanged(db, integration, "ya29.new", None)
        await db.flush()

        assert integration.access_token == "ya29.new"
        assert integration.token_expiry is None


async def _gmail_row(db: AsyncSession, user: User, org: Organization, refresh_token: str | None) -> Integration:
    integration = await integration_repo.upsert_gmail(
        db, org.id, user.id, "ya29.account-a", refresh_token,
        datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc),
    )
    await db.flush()
    return integration


def _detach(db: AsyncSession, integration: Integration) -> Integration:
    """What a Gmail call that started before a reconnect still holds: the row as it was read."""
    db.expunge(integration)
    return integration


class TestCredentialWritesAfterReconnect:
    """A Gmail call that started on one connection must not write onto the next.

    Reconnecting rewrites the integration row in place, possibly to a different
    Google account. A token refresh or a reauth flag from a call still running
    on the old connection is dropped.
    """

    @pytest.mark.asyncio
    async def test_refreshed_token_from_old_connection_is_not_saved(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        stale = _detach(db, await _gmail_row(db, test_user, test_org, "rt-account-a"))
        reconnected = await integration_repo.upsert_gmail(
            db, test_org.id, test_user.id, "ya29.account-b", "rt-account-b",
            datetime(2026, 5, 13, 13, 0, 0, tzinfo=timezone.utc),
        )
        await db.flush()

        saved = await integration_repo.update_access_token_if_unchanged(
            db, stale, "ya29.account-a-refreshed", None,
        )
        await db.flush()

        assert saved is False
        await db.refresh(reconnected)
        assert reconnected.access_token == "ya29.account-b"
        assert reconnected.refresh_token == "rt-account-b"

    @pytest.mark.asyncio
    async def test_reauth_flag_from_old_connection_is_not_set(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        stale = _detach(db, await _gmail_row(db, test_user, test_org, "rt-account-a"))
        reconnected = await integration_repo.upsert_gmail(
            db, test_org.id, test_user.id, "ya29.account-b", "rt-account-b",
            datetime(2026, 5, 13, 13, 0, 0, tzinfo=timezone.utc),
        )
        await db.flush()

        marked = await integration_repo.mark_needs_reauth_if_unchanged(
            db, stale, "invalid_grant", datetime.now(timezone.utc),
        )
        await db.flush()

        assert marked is False
        await db.refresh(reconnected)
        assert reconnected.needs_reauth is False
        assert reconnected.last_reauth_error is None

    @pytest.mark.asyncio
    async def test_reconnect_that_kept_the_refresh_token_still_takes_the_write(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Google may not return a new refresh token; the row keeps the old one,
        so it is still the same connection."""
        stale = _detach(db, await _gmail_row(db, test_user, test_org, "rt-account-a"))
        reconnected = await integration_repo.upsert_gmail(
            db, test_org.id, test_user.id, "ya29.account-a-again", None,
            datetime(2026, 5, 13, 13, 0, 0, tzinfo=timezone.utc),
        )
        await db.flush()

        saved = await integration_repo.update_access_token_if_unchanged(
            db, stale, "ya29.account-a-refreshed", None,
        )
        await db.flush()

        assert saved is True
        await db.refresh(reconnected)
        assert reconnected.access_token == "ya29.account-a-refreshed"

    @pytest.mark.asyncio
    async def test_unchanged_connection_takes_the_reauth_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = await _gmail_row(db, test_user, test_org, "rt-account-a")
        failed_at = datetime(2026, 5, 13, 14, 0, 0, tzinfo=timezone.utc)

        marked = await integration_repo.mark_needs_reauth_if_unchanged(
            db, integration, "invalid_grant", failed_at,
        )
        await db.flush()

        assert marked is True
        assert integration.needs_reauth is True
        assert integration.last_reauth_error == "invalid_grant"
        assert integration.last_reauth_failed_at == failed_at

    @pytest.mark.asyncio
    async def test_connection_without_a_refresh_token_takes_the_write(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        integration = await _gmail_row(db, test_user, test_org, None)

        assert await integration_repo.update_access_token_if_unchanged(
            db, integration, "ya29.refreshed", None,
        )

    @pytest.mark.asyncio
    async def test_disconnected_row_takes_no_write(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        stale = _detach(db, await _gmail_row(db, test_user, test_org, "rt-account-a"))
        row = await integration_repo.get_by_org_and_provider(db, test_org.id, "gmail")
        assert row is not None
        await integration_repo.delete(db, row)
        await db.flush()

        assert not await integration_repo.update_access_token_if_unchanged(db, stale, "ya29.x", None)
        assert not await integration_repo.mark_needs_reauth_if_unchanged(
            db, stale, "invalid_grant", datetime.now(timezone.utc),
        )

    @pytest.mark.asyncio
    async def test_reconnect_clears_a_reauth_flag_the_old_connection_just_saved(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """The old connection's flag can commit after the callback's session read
        the row. The reconnect must re-read it, or clearing it looks like no change
        and the new connection keeps showing "Reconnect Gmail"."""
        integration = await _gmail_row(db, test_user, test_org, "rt-account-a")
        await db.execute(
            update(Integration)
            .where(Integration.id == integration.id)
            .values(needs_reauth=True, last_reauth_error="invalid_grant")
            # Leave the session's copy alone, as another connection's commit would.
            .execution_options(synchronize_session=False)
        )

        reconnected = await integration_repo.upsert_gmail(
            db, test_org.id, test_user.id, "ya29.account-b", "rt-account-b",
            datetime(2026, 5, 13, 13, 0, 0, tzinfo=timezone.utc),
        )
        await integration_repo.clear_reauth_state(db, reconnected)
        await db.flush()
        await db.refresh(reconnected)

        assert reconnected.needs_reauth is False
        assert reconnected.last_reauth_error is None
