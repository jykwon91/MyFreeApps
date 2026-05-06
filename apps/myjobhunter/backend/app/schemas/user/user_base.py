"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas

from platform_shared.core.permissions import Role


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False
    # Surface the platform-level role to the frontend so SPA nav can
    # conditionally render admin-only links (e.g. /admin/demo). The
    # backend remains the source of truth for authorization — the role
    # in this payload is used purely for UI gating.
    role: Role = Role.USER
    is_demo: bool = False


class UserCreate(schemas.BaseUserCreate):
    display_name: str = ""


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
