"""Repository for the small ``channels`` reference table."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.channel import Channel


async def list_all(db: AsyncSession) -> list[Channel]:
    """Return every channel ordered by display name."""
    result = await db.execute(select(Channel).order_by(Channel.name.asc()))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, channel_id: str) -> Channel | None:
    """Return one channel by slug, or None if missing."""
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    return result.scalar_one_or_none()
