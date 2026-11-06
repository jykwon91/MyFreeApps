import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.gmail_connection import GmailConnection
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.integrations.integration import Integration


async def get_by_org_and_provider(
    db: AsyncSession, organization_id: uuid.UUID, provider: str
) -> Integration | None:
    result = await db.execute(
        select(Integration).where(
            Integration.organization_id == organization_id,
            Integration.provider == provider,
        )
    )
    return result.scalar_one_or_none()


async def _lock_if_credentials_unchanged(
    db: AsyncSession, connection: GmailConnection
) -> Integration | None:
    """The row, locked, if it still holds the refresh token ``connection`` was read with.

    A reconnect rewrites the row in place, possibly to a different Google
    account. Work that started on the old connection must not write its
    tokens or its reauth flag onto the new one. Postgres re-checks the filter
    against a row a concurrent reconnect just committed, so the stale writer
    gets None.
    """
    result = await db.execute(
        select(Integration)
        .where(
            Integration.id == connection.id,
            Integration.refresh_token_encrypted.is_not_distinct_from(
                connection.refresh_token_encrypted
            ),
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def mark_needs_reauth_if_unchanged(
    db: AsyncSession,
    connection: GmailConnection,
    error: str,
    failed_at: datetime,
) -> bool:
    """Flip the reauth flag and record when/why, unless the row was reconnected since.

    Returns False when the connection changed, so nothing was written. The
    session is NOT flushed here — the caller must flush or commit.
    """
    current = await _lock_if_credentials_unchanged(db, connection)
    if current is None:
        return False
    current.needs_reauth = True
    current.last_reauth_error = error
    current.last_reauth_failed_at = failed_at
    return True


async def set_gmail_address_if_unchanged(
    db: AsyncSession, connection: GmailConnection, gmail_address: str,
) -> bool:
    """Record the address of a row connected before addresses were recorded.

    Returns False, writing nothing, when the row was reconnected since
    ``connection`` was read: the address belongs to the old account, and the
    reconnect recorded the new one. Not flushed — the caller commits.
    """
    current = await _lock_if_credentials_unchanged(db, connection)
    if current is None:
        return False
    current.gmail_address = gmail_address
    return True


async def clear_reauth_state(db: AsyncSession, integration: Integration) -> None:
    """Clear the reauth flag after a successful OAuth re-flow.

    Called from handle_gmail_callback when fresh tokens are written back.
    """
    integration.needs_reauth = False
    integration.last_reauth_error = None
    integration.last_reauth_failed_at = None


async def list_by_org(
    db: AsyncSession, organization_id: uuid.UUID
) -> Sequence[Integration]:
    result = await db.execute(
        select(Integration).where(Integration.organization_id == organization_id)
    )
    return result.scalars().all()


async def _lock_org_gmail(db: AsyncSession, organization_id: uuid.UUID) -> Integration | None:
    # Locked and re-read so a reauth flag committed by a Gmail call on the old
    # connection is loaded here, and the callback's clear_reauth_state writes it back.
    result = await db.execute(
        select(Integration)
        .where(
            Integration.organization_id == organization_id,
            Integration.provider == "gmail",
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


def _write_connection(
    integration: Integration,
    *,
    user_id: uuid.UUID,
    access_token: str,
    refresh_token: str,
    token_expiry: datetime,
    scopes: list[str] | None,
    gmail_address: str,
) -> None:
    integration.user_id = user_id
    integration.access_token = access_token
    integration.refresh_token = refresh_token
    integration.token_expiry = token_expiry
    integration.gmail_address = gmail_address
    if scopes is not None:
        metadata = dict(integration.metadata_ or {})
        metadata["scopes"] = scopes
        integration.metadata_ = metadata


async def upsert_gmail(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    access_token: str,
    refresh_token: str,
    token_expiry: datetime,
    scopes: list[str] | None = None,
    *,
    gmail_address: str,
) -> Integration:
    """Write a fresh connection onto the org's one Gmail row, made by ``user_id``.

    Everything is overwritten: a reconnect may be a different account, and
    keeping any of the old account's credentials would pair them with it. The
    row's ``user_id`` becomes whoever connected it last, since the tokens are
    now that member's Google account. ``last_synced_at`` is kept: it belongs to
    the row, not the account, and is only shown.
    """
    fields = dict(
        user_id=user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        token_expiry=token_expiry,
        scopes=scopes,
        gmail_address=gmail_address,
    )
    existing = await _lock_org_gmail(db, organization_id)
    if existing is None:
        integration = Integration(organization_id=organization_id, provider="gmail")
        _write_connection(integration, **fields)
        try:
            async with db.begin_nested():
                db.add(integration)
        except IntegrityError:
            # A concurrent first connect inserted the org's row first. Take that
            # row over, as a reconnect would: the latest connect wins either way.
            existing = await _lock_org_gmail(db, organization_id)
            if existing is None:
                raise
        else:
            return integration
    _write_connection(existing, **fields)
    return existing


async def update_last_synced(
    db: AsyncSession, integration: Integration, synced_at: datetime
) -> None:
    integration.last_synced_at = synced_at


async def update_access_token_if_unchanged(
    db: AsyncSession,
    connection: GmailConnection,
    access_token: str,
    expiry: datetime | None,
) -> bool:
    """Persist a refreshed access token (and its expiry), unless the row was reconnected since.

    Called after Google's auth library mints a new access token in-memory.
    Without this, every Gmail call would re-trigger a refresh because the
    DB-stored access_token stays frozen at OAuth-callback time. Returns False
    when the connection changed, so nothing was written.

    ``expiry`` is normalized to timezone-aware UTC because google-auth returns
    naive UTC datetimes.
    """
    current = await _lock_if_credentials_unchanged(db, connection)
    if current is None:
        return False
    current.access_token = access_token
    if expiry is not None and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    current.token_expiry = expiry
    return True


async def list_active_gmail_sync_targets(db: AsyncSession) -> list[GmailSyncTarget]:
    """Every Gmail connection the scheduler should sync: those not waiting on a reconnect.

    Expired tokens are skipped so they aren't retried every cycle.
    """
    result = await db.execute(
        select(Integration.organization_id, Integration.user_id).where(
            Integration.provider == "gmail",
            Integration.needs_reauth.is_(False),
        )
    )
    return [GmailSyncTarget(organization_id=org_id, user_id=uid) for org_id, uid in result.all()]


async def delete_connected_by(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> list[str]:
    """Delete the org's connections that ``user_id`` made. Returns their providers."""
    result = await db.execute(
        select(Integration).where(
            Integration.organization_id == organization_id,
            Integration.user_id == user_id,
        )
    )
    rows = result.scalars().all()
    for integration in rows:
        await db.delete(integration)
    return [integration.provider for integration in rows]


async def delete(db: AsyncSession, integration: Integration) -> None:
    await db.delete(integration)
