"""The shared user export section lists exactly the whitelisted fields."""
import uuid
from dataclasses import dataclass, field

from platform_shared.core.permissions import Role
from platform_shared.core.user_export import user_to_export_dict


@dataclass
class _User:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    email: str = "cook@example.com"
    display_name: str = "Cook"
    is_active: bool = True
    is_verified: bool = True
    is_superuser: bool = False
    role: Role = Role.USER
    totp_enabled: bool = False
    hashed_password: str = "secret-hash"
    totp_secret: str = "secret-totp"
    totp_recovery_codes: str = "secret-codes"


def test_exports_every_whitelisted_field() -> None:
    user = _User(is_superuser=True, role=Role.ADMIN, totp_enabled=True)

    assert user_to_export_dict(user) == {
        "id": str(user.id),
        "email": "cook@example.com",
        "display_name": "Cook",
        "is_active": True,
        "is_verified": True,
        "is_superuser": True,
        "role": "admin",
        "totp_enabled": True,
    }


def test_never_exports_credentials() -> None:
    exported = user_to_export_dict(_User())

    assert not {"hashed_password", "totp_secret", "totp_recovery_codes"} & exported.keys()
    assert "secret" not in " ".join(str(v) for v in exported.values())
