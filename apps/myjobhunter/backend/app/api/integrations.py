from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.services.integration import integration_service

router = APIRouter()


@router.get("/integrations")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await integration_service.list_integrations(db, user.id)
    return {"items": []}
