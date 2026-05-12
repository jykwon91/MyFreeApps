"""MGA-specific account-management services.

delete_user_data: wired into the shared account-deletion router. Deletes
all game data owned by the user. Since MGA is single-user, this is mostly a
safety measure for the operator to wipe + re-seed.

build_export: assembles a full per-user data export. Phase 1 stub — lineup
data export added in Phase 2+.

Phase 1: no user-owned domain rows yet (lineup ownership by user_id is Phase 2+).
The FK ON DELETE CASCADE on user → game data will handle cleanup automatically.

Mirrors apps/myjobhunter/backend/app/services/user/account_service.py shape.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def delete_user_data(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete all MGA domain data owned by ``user_id``.

    Phase 1: no user-scoped domain rows yet. The shared deletion router
    handles the user row itself via its own cascade logic.
    """
    # TODO Phase 2+: if lineups gain a user_id owner FK, delete them here.
    logger.info("delete_user_data called for user_id=%s — no domain rows to delete", user_id)


async def build_export(db: AsyncSession, user) -> dict:
    """Assemble the full data export for ``user``.

    Phase 1 stub — returns user profile metadata only. Lineup data and
    sources are added in Phase 2+.

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
        "lineups": [],   # TODO Phase 2: populate from lineup repo
        "sources": [],   # TODO Phase 2: populate from source repo
        "packages": [],  # TODO Phase 4: populate from lineup_package repo
    }
