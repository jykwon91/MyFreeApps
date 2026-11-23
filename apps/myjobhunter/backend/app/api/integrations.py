from fastapi import APIRouter, Depends

from app.core.auth import current_active_user
from app.models.user.user import User

router = APIRouter()


@router.get("/integrations")
async def list_integrations(
    user: User = Depends(current_active_user),
) -> dict:
    return {"items": []}
