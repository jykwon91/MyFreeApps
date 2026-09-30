"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False


class UserCreate(schemas.BaseUserCreate):
    display_name: str = ""


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
