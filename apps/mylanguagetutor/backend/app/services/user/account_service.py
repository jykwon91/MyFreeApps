"""MyLanguageTutor account-management services.

Account deletion: every tutor table (``tutor_profile``, ``tutor_session``,
``tutor_turn``) carries ``user_id`` with ``ON DELETE CASCADE``. The user's
``ltutor:user:{id}`` counter rows in ``daily_usage_counters`` are keyed by a
plain string, so they are removed explicitly by
``account_deletion_service.prepare_deletion``.

build_export: assembles the full per-user data export -- profile metadata, the
tutor profile (onboarding language + level), plus every tutor session and
its turns (decrypted transcript text; the export is the user's own data).
Transcript text is never logged.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_profile import TutorProfile
from app.models.tutor.tutor_turn import TutorTurn
from app.models.user.user import User
from app.repositories.tutor import (
    tutor_profile_repository,
    tutor_session_repository,
    tutor_turn_repository,
)
from app.services.tutor.tutor_mappers import to_session_detail

def _profile_export(profile: TutorProfile | None) -> dict[str, str] | None:
    if profile is None:
        return None
    return {"language_code": profile.language_code, "level": profile.level}


async def build_export(db: AsyncSession, user: User) -> dict[str, Any]:
    """Assemble the full data export for ``user``.

    Never includes hashed_password, TOTP secret, or recovery codes.
    """
    sessions = await tutor_session_repository.list_all_by_user(db, user.id)
    turns = await tutor_turn_repository.list_all_by_user(db, user.id)
    profile = await tutor_profile_repository.get(db, user.id)
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
        "tutor_profile": _profile_export(profile),
        "tutor_sessions": [
            to_session_detail(session, turns_by_session.get(session.id, [])).model_dump(
                mode="json",
            )
            for session in sessions
        ],
    }
