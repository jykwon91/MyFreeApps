"""The user attributes the account data export reads."""
import uuid
from typing import Protocol

from platform_shared.core.permissions import Role


class ExportableUser(Protocol):
    """Structural type satisfied by every app's ``User`` model.

    Only the exportable columns are listed, so credentials (password hash,
    TOTP secret, recovery codes) are unreachable through this type.
    """

    id: uuid.UUID
    email: str
    display_name: str
    is_active: bool
    is_verified: bool
    is_superuser: bool
    role: Role
    totp_enabled: bool
