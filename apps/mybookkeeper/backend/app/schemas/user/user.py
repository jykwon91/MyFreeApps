import uuid

from fastapi_users import schemas
from platform_shared.schemas.self_service_user_update import SelfServiceUserUpdate
from pydantic import BaseModel

from app.models.user.user import Role
from app.schemas.user.user_name import UserName


class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str | None = None
    role: Role = Role.USER


class UserCreate(schemas.BaseUserCreate):
    name: UserName = None


class UserUpdate(SelfServiceUserUpdate):
    name: UserName = None


class AdminUserRoleUpdate(BaseModel):
    role: Role
