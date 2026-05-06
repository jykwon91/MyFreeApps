"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False
    # Demo flag — exposed so the demo-cleanup admin tooling can identify
    # seeded accounts. ``is_superuser`` is inherited from
    # fastapi-users' BaseUser so the SPA can gate the operator-only
    # admin dashboard. MJH does not have a multi-tier role system —
    # the operator is the sole superuser; everyone else is a regular
    # user.
    is_demo: bool = False


class UserCreate(schemas.BaseUserCreate):
    display_name: str = ""


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
