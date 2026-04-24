from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.services.profile import profile_service

router = APIRouter()


@router.get("/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    profile = await profile_service.get_profile(db, user.id)
    return {"profile": None if profile is None else {"id": str(profile.id)}}
