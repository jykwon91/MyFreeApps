"""What the shared ``/auth/totp`` routes read from an app's user model."""
import uuid
from typing import Protocol

from platform_shared.services.account_lockout import LockoutAccount


class TotpRouteUser(LockoutAccount, Protocol):
    id: uuid.UUID
    email: str
    is_active: bool
    is_verified: bool
    totp_enabled: bool
