"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas
from platform_shared.schemas.display_name import DisplayName
from platform_shared.schemas.self_service_user_update import SelfServiceUserUpdate


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False
    # NOTE: ``is_demo`` is intentionally NOT exposed on this schema.
    # Demo-cleanup admin tooling reads it directly from the DB via
    # ``demo_repo`` — there is no need to leak demo-status to every
    # ``GET /users/me`` response. ``is_superuser`` is inherited from
    # fastapi-users' BaseUser so the SPA can gate the operator-only
    # admin dashboard. MJH does not have a multi-tier role system —
    # the operator is the sole superuser; everyone else is a regular
    # user.


class UserCreate(schemas.BaseUserCreate):
    display_name: DisplayName = ""


class UserUpdate(SelfServiceUserUpdate):
    # create_update_dict() drops unset fields, so this default never overwrites a saved name.
    display_name: DisplayName = ""
