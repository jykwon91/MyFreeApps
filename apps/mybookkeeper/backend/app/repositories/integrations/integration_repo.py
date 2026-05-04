import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def mark_needs_reauth(
    db: AsyncSession,
    integration: Integration,
    error: str,
    failed_at: datetime,
) -> None:
    """Flip the reauth flag and record when/why it was set.

    Called from the Gmail client seam immediately after catching a RefreshError
    so the state is persisted before raising GmailReauthRequiredError to callers.
    The session is NOT flushed here — the caller must flush or commit.
    """
    integration.needs_reauth = True
    integration.last_reauth_error = error
    integration.last_reauth_failed_at = failed_at


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


async def upsert_gmail(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    access_token: str,
    refresh_token: str | None,
    token_expiry: datetime,
    scopes: list[str] | None = None,
) -> Integration:
    result = await db.execute(
        select(Integration).where(
            Integration.organization_id == organization_id,
            Integration.provider == "gmail",
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.access_token = access_token
        if refresh_token is not None:
            existing.refresh_token = refresh_token
        existing.token_expiry = token_expiry
        if scopes is not None:
            metadata = dict(existing.metadata_ or {})
            metadata["scopes"] = scopes
            existing.metadata_ = metadata
        return existing

    metadata: dict[str, object] = {}
    if scopes is not None:
        metadata["scopes"] = scopes

    integration = Integration(
        organization_id=organization_id,
        user_id=user_id,
        provider="gmail",
        token_expiry=token_expiry,
        metadata_=metadata or None,
    )
    integration.access_token = access_token
    integration.refresh_token = refresh_token
    db.add(integration)
    await db.flush()
    return integration


async def update_last_synced(
    db: AsyncSession, integration: Integration, synced_at: datetime
) -> None:
    integration.last_synced_at = synced_at


async def get_gmail_user_ids(db: AsyncSession) -> list[str]:
    """Return all Gmail integration user IDs, including those in needs_reauth state.

    Use ``get_active_gmail_user_ids`` in the scheduler to skip expired tokens.
    """
    result = await db.execute(
        select(Integration.user_id).where(Integration.provider == "gmail")
    )
    return [str(uid) for uid in result.scalars().all()]


async def get_active_gmail_user_ids(db: AsyncSession) -> list[str]:
    """Return Gmail integration user IDs where needs_reauth is False.

    The scheduler uses this to avoid retrying dead tokens every 15 minutes.
    """
    result = await db.execute(
        select(Integration.user_id).where(
            Integration.provider == "gmail",
            Integration.needs_reauth.is_(False),
        )
    )
    return [str(uid) for uid in result.scalars().all()]


async def delete(db: AsyncSession, integration: Integration) -> None:
    await db.delete(integration)
