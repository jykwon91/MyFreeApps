"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas

from platform_shared.core.permissions import Role


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False
    # Platform-level role + demo flag — exposed so the SPA can gate
    # admin-only nav (Demo and Invites pages) and so the demo cleanup
    # tooling can identify seeded accounts. Backend remains the source
    # of truth for authorization.
    role: Role = Role.USER
    is_demo: bool = False


class UserCreate(schemas.BaseUserCreate):
    display_name: str = ""


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
