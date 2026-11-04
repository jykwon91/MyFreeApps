"""Signed-in devices, for clients that keep a refresh token.

Nothing here commits. The caller commits on every outcome, including a refused
refresh, because refusing can end the session.

Clients must send one refresh at a time. Parallel refreshes with one secret look
like a lost response followed by a second holder.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.refresh_token import (
    format_refresh_token,
    generate_refresh_secret,
    hash_refresh_secret,
    parse_refresh_token,
    refresh_secret_matches,
)
from platform_shared.auth.refreshed_session import RefreshedSession
from platform_shared.core.refresh_session_limits import (
    REFRESH_SESSION_ABSOLUTE_SECONDS,
    REFRESH_SESSION_IDLE_SECONDS,
    REFRESH_SESSION_PREVIOUS_SECRET_SECONDS,
)
from platform_shared.repositories import refresh_session_repo, user_repo

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class RefreshSessionService:
    session_model: type[Any]
    user_model: type[Any]
    idle_seconds: int = REFRESH_SESSION_IDLE_SECONDS
    absolute_seconds: int = REFRESH_SESSION_ABSOLUTE_SECONDS
    previous_secret_seconds: int = REFRESH_SESSION_PREVIOUS_SECRET_SECONDS

    def _is_usable(self, session: Any, user: Any, now: datetime) -> bool:
        """Expired, idle, disabled, or from before the user's session cutoff: not usable.

        The cutoff is the revocation: every path that ends a user's sessions already
        sets it, so a password change can't miss a device.
        """
        if not user.is_active or now >= session.expires_at:
            return False
        if now >= session.last_used_at + timedelta(seconds=self.idle_seconds):
            return False
        cutoff = user.auth_valid_after
        return cutoff is None or session.created_at >= cutoff

    async def issue(
        self, db: AsyncSession, user: Any, *, auth_time: datetime, device_name: str | None = None,
    ) -> RefreshedSession:
        """Start a session after a login. ``auth_time`` is when that login happened."""
        now = _now()
        await refresh_session_repo.delete_expired_for_user(
            db,
            self.session_model,
            user.id,
            now=now,
            last_used_before=now - timedelta(seconds=self.idle_seconds),
        )
        session_id = uuid.uuid4()
        secret = generate_refresh_secret()
        session = self.session_model(
            id=session_id,
            user_id=user.id,
            current_secret_hash=hash_refresh_secret(secret),
            device_name=device_name,
            auth_time=auth_time,
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(seconds=self.absolute_seconds),
        )
        db.add(session)
        return RefreshedSession(
            user=user, session=session, refresh_token=format_refresh_token(session_id, secret),
        )

    async def rotate(self, db: AsyncSession, token: str) -> RefreshedSession | None:
        """Swap a refresh token for a new one, or None if it can't be used.

        - The current secret proves the client received it. The one before it stops
          working.
        - The previous secret, shortly after it was replaced, means the last response
          never arrived. The client gets a new secret, and the one it never received
          is remembered as abandoned.
        - An abandoned secret was received after all, so two parties hold this
          session: a stolen token was used. The session ends for both.
        - Any other secret changes nothing, because anyone who knows a session id
          could otherwise sign that device out.
        """
        parsed = parse_refresh_token(token)
        if parsed is None:
            return None
        session_id, presented = parsed
        session = await refresh_session_repo.lock_by_id(db, self.session_model, session_id)
        if session is None:
            return None

        now = _now()
        if refresh_secret_matches(presented, session.abandoned_secret_hash):
            logger.warning(
                "Refresh session ended, abandoned secret presented: session_id=%s user_id=%s",
                session.id,
                session.user_id,
            )
            await refresh_session_repo.delete_session(db, session)
            return None

        is_current = refresh_secret_matches(presented, session.current_secret_hash)
        is_previous = (
            not is_current
            and refresh_secret_matches(presented, session.previous_secret_hash)
            and session.previous_valid_until is not None
            and now < session.previous_valid_until
        )
        if not is_current and not is_previous:
            return None

        user = await user_repo.get_by_id(db, session.user_id, user_model=self.user_model)
        if user is None or not self._is_usable(session, user, now):
            return None

        secret = generate_refresh_secret()
        if is_current:
            session.previous_secret_hash = session.current_secret_hash
            session.previous_valid_until = now + timedelta(seconds=self.previous_secret_seconds)
        else:
            session.abandoned_secret_hash = session.current_secret_hash
        session.current_secret_hash = hash_refresh_secret(secret)
        session.last_used_at = now
        return RefreshedSession(
            user=user, session=session, refresh_token=format_refresh_token(session.id, secret),
        )

    async def list_active(self, db: AsyncSession, user: Any) -> Sequence[Any]:
        """The user's devices that can still refresh, most recently used first."""
        now = _now()
        sessions = await refresh_session_repo.list_for_user(db, self.session_model, user.id)
        return [session for session in sessions if self._is_usable(session, user, now)]

    async def revoke(self, db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> bool:
        """Sign out one of this user's devices. False if it isn't theirs or doesn't exist."""
        return await refresh_session_repo.delete_owned(db, self.session_model, user_id, session_id)


__all__ = ["RefreshSessionService"]
