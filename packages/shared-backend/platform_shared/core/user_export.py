"""The ``user`` section of the account data export, shared by every app."""
from platform_shared.core.exportable_user import ExportableUser


def user_to_export_dict(user: ExportableUser) -> dict[str, str | bool]:
    """Whitelisted user fields; secrets on the row can never be exported.

    The user row stores no registration timestamp, so none is exported.
    """
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_superuser": user.is_superuser,
        "role": user.role,
        "totp_enabled": user.totp_enabled,
    }


__all__ = ["user_to_export_dict"]
