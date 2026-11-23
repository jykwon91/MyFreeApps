"""The user an admin action targets doesn't exist — HTTP 404."""
from __future__ import annotations

from platform_shared.core.admin_user_messages import ADMIN_TARGET_USER_NOT_FOUND_DETAIL


class AdminTargetUserNotFoundError(LookupError):
    """No user has the targeted id.

    Its message is fixed copy and is the reply's ``detail``. The admin routes
    catch this type, not ``LookupError``: SQLAlchemy raises a plain
    ``LookupError`` when a stored enum value (a user's ``role``) isn't one the
    code knows. That is a server fault, so it fails loud as a 500 with the
    real error logged, rather than passing for a missing user.
    """

    def __init__(self) -> None:
        super().__init__(ADMIN_TARGET_USER_NOT_FOUND_DETAIL)
