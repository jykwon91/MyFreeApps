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
        return existing

    integration = Integration(
        organization_id=organization_id,
        user_id=user_id,
        provider="gmail",
        access_token=access_token,
        refresh_token=refresh_token,
        token_expiry=token_expiry,
    )
    db.add(integration)
    await db.flush()
    return integration


async def update_last_synced(
    db: AsyncSession, integration: Integration, synced_at: datetime
) -> None:
    integration.last_synced_at = synced_at


async def get_gmail_user_ids(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(Integration.user_id).where(Integration.provider == "gmail")
    )
    return [str(uid) for uid in result.scalars().all()]


async def delete(db: AsyncSession, integration: Integration) -> None:
    await db.delete(integration)
