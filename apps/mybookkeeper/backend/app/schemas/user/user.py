import uuid

from fastapi_users import schemas
from pydantic import BaseModel

from app.models.user.user import Role
from app.schemas.user.user_name import UserName


class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str | None = None
    role: Role = Role.USER


class UserCreate(schemas.BaseUserCreate):
    name: UserName = None


class UserUpdate(schemas.BaseUserUpdate):
    name: UserName = None


class AdminUserRoleUpdate(BaseModel):
    role: Role
