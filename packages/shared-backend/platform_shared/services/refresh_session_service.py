"""Signed-in devices, for clients that keep a refresh token.

Each write is its own transaction, committed on every outcome, including a refused
refresh, because refusing can end the session.

Clients must send one refresh at a time. Parallel refreshes with one secret look
like a lost response followed by a stolen token.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.refresh_token import (
    format_refresh_token,
    generate_refresh_secret,
    hash_refresh_secret,
    parse_refresh_token,
    refresh_secret_matches,
)
from platform_shared.auth.refreshed_session import RefreshedSession
from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.refresh_session_limits import (
    REFRESH_SESSION_ABSOLUTE_SECONDS,
    REFRESH_SESSION_IDLE_SECONDS,
    REFRESH_SESSION_MAX_PER_USER,
    REFRESH_SESSION_PREVIOUS_SECRET_SECONDS,
)
from platform_shared.repositories import refresh_session_repo, user_repo
from platform_shared.services.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class RefreshSessionService:
    session_model: type[Any]
    user_model: type[Any]
    signing_key: str
    unit_of_work_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]]
    idle_seconds: int = REFRESH_SESSION_IDLE_SECONDS
    absolute_seconds: int = REFRESH_SESSION_ABSOLUTE_SECONDS
    previous_secret_seconds: int = REFRESH_SESSION_PREVIOUS_SECRET_SECONDS
    max_per_user: int = REFRESH_SESSION_MAX_PER_USER

    def __post_init__(self) -> None:
        if not self.signing_key:
            raise ValueError("RefreshSessionService needs a signing key")

    def _is_usable(self, session: Any, user: Any, now: datetime) -> bool:
        """Expired, idle, disabled, or from before the user's session cutoff: not usable.

        The cutoff is the revocation: a password change sets it, so it can't miss a
        device. Disabling a user only pauses their sessions: within the limits, they
        work again if the user is re-enabled.
        """
        if not user.is_active or now >= session.expires_at:
            return False
        if now >= session.last_used_at + timedelta(seconds=self.idle_seconds):
            return False
        cutoff = user.auth_valid_after
        return cutoff is None or session.created_at >= cutoff

    async def issue(self, user: Any, *, device_name: str | None = None) -> RefreshedSession:
        """Start a session for a login that just succeeded."""
        async with self.unit_of_work_factory() as db:
            return await self._issue(db, user, device_name)

    async def _issue(self, db: AsyncSession, user: Any, device_name: str | None) -> RefreshedSession:
        now = _now()
        await refresh_session_repo.delete_expired_for_user(
            db,
            self.session_model,
            user.id,
            now=now,
            last_used_before=now - timedelta(seconds=self.idle_seconds),
        )
        await refresh_session_repo.delete_all_but_newest(
            db, self.session_model, user.id, keep=self.max_per_user - 1,
        )
        session_id = uuid.uuid4()
        secret = generate_refresh_secret()
        session = self.session_model(
            id=session_id,
            user_id=user.id,
            current_secret_hash=hash_refresh_secret(secret),
            device_name=device_name,
            auth_time=now,
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(seconds=self.absolute_seconds),
        )
        refresh_session_repo.add(db, session)
        return RefreshedSession(
            user=user, session=session, refresh_token=format_refresh_token(session_id, secret, self.signing_key),
        )

    def session_id_of(self, token: str) -> uuid.UUID | None:
        """The session a token this server issued belongs to, otherwise None."""
        parsed = parse_refresh_token(token, self.signing_key)
        return None if parsed is None else parsed[0]

    async def end(self, token: str) -> None:
        """Sign out the device holding this token. Doing it twice is fine."""
        session_id = self.session_id_of(token)
        if session_id is not None:
            async with self.unit_of_work_factory() as db:
                await refresh_session_repo.delete_by_id(db, self.session_model, session_id)

    async def rotate(self, token: str, *, request: Request | None = None) -> RefreshedSession | None:
        """Swap a refresh token for a new one, or None if it can't be used.

        - A token this server didn't sign changes nothing, so knowing a session id
          isn't enough to end that session.
        - The current secret proves the client received it.
        - The previous secret, within its grace period, means the last response never
          arrived. The client gets a new secret.
        - Any other signed token was issued for this session and has been replaced.
          A client only goes back to its previous token, so two parties hold this
          session, and the session ends for both.
        """
        async with self.unit_of_work_factory() as db:
            return await self._rotate(db, token, request)

    async def _rotate(self, db: AsyncSession, token: str, request: Request | None) -> RefreshedSession | None:
        parsed = parse_refresh_token(token, self.signing_key)
        if parsed is None:
            return None
        session_id, presented = parsed
        session = await refresh_session_repo.lock_by_id(db, self.session_model, session_id)
        if session is None:
            return None

        now = _now()
        is_current = refresh_secret_matches(presented, session.current_secret_hash)
        is_previous = (
            not is_current
            and refresh_secret_matches(presented, session.previous_secret_hash)
            and session.previous_valid_until is not None
            and now < session.previous_valid_until
        )
        if not is_current and not is_previous:
            logger.warning(
                "Refresh session ended, replaced token presented: session_id=%s user_id=%s",
                session.id,
                session.user_id,
            )
            await log_auth_event(
                db,
                event_type=AuthEventType.REFRESH_TOKEN_REPLAYED,
                user_id=session.user_id,
                request=request,
                succeeded=False,
                metadata={"session_id": str(session.id)},
            )
            await refresh_session_repo.delete_session(db, session)
            return None

        user = await user_repo.get_by_id(db, session.user_id, user_model=self.user_model)
        if user is None or not self._is_usable(session, user, now):
            return None

        secret = generate_refresh_secret()
        if is_current:
            session.previous_secret_hash = session.current_secret_hash
            session.previous_valid_until = now + timedelta(seconds=self.previous_secret_seconds)
        session.current_secret_hash = hash_refresh_secret(secret)
        session.last_used_at = now
        return RefreshedSession(
            user=user, session=session, refresh_token=format_refresh_token(session.id, secret, self.signing_key),
        )

    async def list_active(self, db: AsyncSession, user: Any) -> Sequence[Any]:
        """The user's devices that can still refresh, most recently used first."""
        now = _now()
        sessions = await refresh_session_repo.list_for_user(db, self.session_model, user.id)
        return [session for session in sessions if self._is_usable(session, user, now)]

    async def revoke(
        self, user_id: uuid.UUID, session_id: uuid.UUID, *, request: Request | None = None,
    ) -> bool:
        """Sign out one of this user's devices. False if it isn't theirs or doesn't exist."""
        async with self.unit_of_work_factory() as db:
            revoked = await refresh_session_repo.delete_owned(db, self.session_model, user_id, session_id)
            if revoked:
                await log_auth_event(
                    db,
                    event_type=AuthEventType.DEVICE_SIGNED_OUT,
                    user_id=user_id,
                    request=request,
                    succeeded=True,
                    metadata={"session_id": str(session_id)},
                )
            return revoked


__all__ = ["RefreshSessionService"]
