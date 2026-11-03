"""fastapi-users base schemas for the User entity."""
import uuid

from fastapi_users import schemas
from platform_shared.schemas.display_name import DisplayName
from platform_shared.schemas.self_service_user_update import SelfServiceUserUpdate


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str = ""
    totp_enabled: bool = False


class UserCreate(schemas.BaseUserCreate):
    display_name: DisplayName = ""


class UserUpdate(SelfServiceUserUpdate):
    # create_update_dict() drops unset fields, so this default never overwrites a saved name.
    display_name: DisplayName = ""
