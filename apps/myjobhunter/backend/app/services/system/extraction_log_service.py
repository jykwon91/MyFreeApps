"""ExtractionLog service — Phase 1 stub.

Token accounting for Claude/Tavily calls, used in Phase 2+.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.extraction_log import ExtractionLog
from app.repositories.system import extraction_log_repository


async def list_logs(db: AsyncSession, user_id: uuid.UUID) -> list[ExtractionLog]:
    return await extraction_log_repository.list_by_user(db, user_id)
