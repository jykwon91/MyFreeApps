"""Integration service — Phase 1 stub.

Manages job_board_credential records.
Full CRUD implemented in Phase 2.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration.job_board_credential import JobBoardCredential
from app.repositories.integration import job_board_credential_repository


async def list_integrations(db: AsyncSession, user_id: uuid.UUID) -> list[JobBoardCredential]:
    return await job_board_credential_repository.list_by_user(db, user_id)
