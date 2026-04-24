"""Application service — Phase 1 stub.

Orchestrates application + application_event + application_contact + document.
No latest_status column — compute via lateral join in Phase 2.
Full CRUD implemented in Phase 2.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.repositories.application import application_repository


async def list_applications(db: AsyncSession, user_id: uuid.UUID) -> list[Application]:
    return await application_repository.list_by_user(db, user_id)
