"""MyLanguageTutor account-management services.

delete_user_data: hook for app-owned data the FK cascade can't reach. Every
tutor table (``tutor_session``, ``tutor_turn``) carries ``user_id`` with
``ON DELETE CASCADE``, so the shared account-deletion router's single
``DELETE FROM users`` removes them; nothing extra to do here.

build_export: assembles the full per-user data export -- profile metadata plus
every tutor session and its turns (decrypted transcript text; the export is
the user's own data). Transcript text is never logged.
"""
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_turn import TutorTurn
from app.models.user.user import User
from app.repositories.tutor import tutor_session_repository, tutor_turn_repository
from app.services.tutor.tutor_mappers import to_session_detail

logger = logging.getLogger(__name__)


async def delete_user_data(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete app-owned data for ``user_id`` not covered by the FK cascade.

    None today: tutor sessions and turns cascade from ``users``.
    """
    logger.info("delete_user_data called for user_id=%s -- tutor rows cascade", user_id)


async def build_export(db: AsyncSession, user: User) -> dict[str, Any]:
    """Assemble the full data export for ``user``.

    Never includes hashed_password, TOTP secret, or recovery codes.
    """
    sessions = await tutor_session_repository.list_all_by_user(db, user.id)
    turns = await tutor_turn_repository.list_all_by_user(db, user.id)
    turns_by_session: dict[uuid.UUID, list[TutorTurn]] = defaultdict(list)
    for turn in turns:
        turns_by_session[turn.session_id].append(turn)

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "is_verified": user.is_verified,
            "totp_enabled": user.totp_enabled,
        },
        "tutor_sessions": [
            to_session_detail(session, turns_by_session.get(session.id, [])).model_dump(
                mode="json",
            )
            for session in sessions
        ],
    }
