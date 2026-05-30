import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_send import WelcomeManualSend


async def create(
    db: AsyncSession,
    *,
    manual_id: uuid.UUID,
    recipient_email: str,
    recipient_name: str | None,
    status: str,
    error_reason: str | None = None,
) -> WelcomeManualSend:
    """Insert a send-log row. The caller has already loaded the parent manual
    org-scoped, so no tenant column is needed here (isolation is via the FK)."""
    send = WelcomeManualSend(
        manual_id=manual_id,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        status=status,
        error_reason=error_reason,
    )
    db.add(send)
    await db.flush()
    return send


async def list_by_manual(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> list[WelcomeManualSend]:
    """List send-log rows for a manual, newest first."""
    result = await db.execute(
        select(WelcomeManualSend)
        .where(WelcomeManualSend.manual_id == manual_id)
        .order_by(WelcomeManualSend.created_at.desc())
    )
    return list(result.scalars().all())
