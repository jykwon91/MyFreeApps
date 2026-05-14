"""__APP_DISPLAY_NAME__ account-management services.

delete_user_data: wired into the shared account-deletion router. Deletes
all app-owned data for the user. As domain models are added, populate this
with the right per-table deletes.

build_export: assembles a full per-user data export. Scaffold stub returns
user profile metadata only; populate with domain rows as they're added.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def delete_user_data(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete all app-owned data for ``user_id``.

    Scaffold stub: no user-scoped domain rows yet. The shared deletion
    router handles the user row itself via its own cascade logic.
    """
    logger.info("delete_user_data called for user_id=%s -- no domain rows to delete", user_id)


async def build_export(db: AsyncSession, user) -> dict:
    """Assemble the full data export for ``user``.

    Scaffold stub -- returns user profile metadata only. Populate with
    domain rows as they're added to the app.

    Never includes hashed_password, TOTP secret, or recovery codes.
    """
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "is_verified": user.is_verified,
            "totp_enabled": user.totp_enabled,
        },
    }
