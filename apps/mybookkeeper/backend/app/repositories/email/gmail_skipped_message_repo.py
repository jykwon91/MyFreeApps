import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.gmail_skipped_message import GmailSkippedMessage


async def record_skip(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    gmail_message_id: str,
    exc: Exception,
) -> GmailSkippedMessage:
    row = GmailSkippedMessage(
        organization_id=organization_id,
        user_id=user_id,
        gmail_message_id=gmail_message_id,
        exception_type=type(exc).__name__,
        exception_message=str(exc)[:2000],
    )
    db.add(row)
    await db.flush()
    return row
