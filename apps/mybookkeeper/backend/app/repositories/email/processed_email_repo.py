import uuid

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.processed_email import ProcessedEmail


async def upsert(
    db: AsyncSession,
    message_id: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    subject: str | None,
) -> None:
    stmt = pg_insert(ProcessedEmail).values(
        message_id=message_id,
        organization_id=organization_id,
        user_id=user_id,
        subject=subject,
    ).on_conflict_do_nothing()
    await db.execute(stmt)
