import uuid

from fastapi_users import schemas
from pydantic import BaseModel

from app.models.user.user import Role


class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str | None = None
    role: Role = Role.USER


class UserCreate(schemas.BaseUserCreate):
    name: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    name: str | None = None


class AdminUserRoleUpdate(BaseModel):
    role: Role
