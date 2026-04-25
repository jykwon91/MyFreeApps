from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_active_user
from app.core.config import settings
from app.db.session import unit_of_work
from app.models.user.user import Role, User
from app.repositories.user import user_repo
from app.schemas.user.user import UserRead

router = APIRouter(prefix="/test", tags=["test"])


@router.post("/promote-admin", response_model=UserRead)
async def promote_to_admin(
    user: User = Depends(current_active_user),
) -> User:
    if not settings.allow_test_admin_promotion:
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )

    if user.role == Role.ADMIN:
        return user

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user.id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        await user_repo.update_role(db, target, Role.ADMIN)
        return target
