"""Shared JWT authentication backend for fastapi-users.

Both MBK and MJH wire fastapi-users with the same shape:

    bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")
    def get_jwt_strategy() -> JWTStrategy:
        return JWTStrategy(secret=settings.secret_key, lifetime_seconds=...)
    auth_backend = AuthenticationBackend(
        name="jwt", transport=bearer_transport, get_strategy=get_jwt_strategy
    )

Extracted to a factory so future apps inherit the wiring with one
function call. Apps thin-wrap by binding their own settings. Existing
imports of ``bearer_transport``, ``get_jwt_strategy``, and ``auth_backend``
from each app's ``app.core.auth`` continue to resolve unchanged.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any, Generic, NamedTuple

import jwt
from fastapi_users import models
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.jwt import SecretType, decode_jwt, generate_jwt
from fastapi_users.manager import BaseUserManager
from pydantic import SecretStr

from platform_shared.auth.session_invalidation import is_issued_before_cutoff
from platform_shared.repositories import refresh_session_repo


class IatJWTStrategy(JWTStrategy[models.UP, models.ID], Generic[models.UP, models.ID]):
    """JWTStrategy that adds ``iat``, ``auth_time`` and, for phones, ``sid`` claims.

    fastapi-users 15.x ``JWTStrategy.write_token`` emits only ``sub``,
    ``aud``, and ``exp``. The platform needs more:

    - ``iat``, when this token was issued. A token issued before the user's
      session cutoff stops working.
    - ``auth_time``, when the user last proved who they are. The strict-superuser
      gate (``platform_shared.core.permissions.make_strict_superuser_gate``)
      reads it to enforce a recent-auth window.
    - ``sid``, the refresh session a phone's token belongs to, so a change that
      ends every other session can tell which one is the caller's, and so the token
      stops working as soon as that session is signed out.

    ``iat`` and ``auth_time`` are separate because a token renewed without a login
    would get a new ``iat`` while the user's proof of identity stays as old as it was.
    """

    def __init__(
        self,
        secret: SecretType,
        lifetime_seconds: int | None,
        *,
        session_model: type[Any] | None = None,
    ) -> None:
        """``session_model`` is the app's ``RefreshSession`` model.

        Without it a token carrying ``sid`` is refused, because its session can't be
        checked. Only a strategy that never reads phone tokens may leave it out.
        """
        super().__init__(secret, lifetime_seconds)
        self.session_model = session_model

    async def read_token(
        self, token: str | None, user_manager: BaseUserManager[models.UP, models.ID],
    ) -> models.UP | None:
        """Reject a valid token issued before the user's session cutoff, or whose
        phone session has been signed out."""
        user = await super().read_token(token, user_manager)
        if user is None:
            return None
        try:
            claims = decode_jwt(
                token, self.decode_key, self.token_audience, algorithms=[self.algorithm],
            )
        except jwt.PyJWTError:
            return None
        if user.auth_valid_after is not None:
            issued_at = claims.get("iat")
            if not isinstance(issued_at, int) or is_issued_before_cutoff(issued_at, user.auth_valid_after):
                return None
        if "sid" in claims and not await self._session_is_live(claims["sid"], user, user_manager):
            return None
        return user

    async def _session_is_live(
        self, claimed_session_id: object, user: models.UP, user_manager: BaseUserManager[models.UP, models.ID],
    ) -> bool:
        """Whether the phone session a token belongs to still exists.

        Signing a device out deletes its session, so its access token stops working
        at once instead of lasting until it expires. Web tokens carry no ``sid``.
        """
        session_id = _parse_session_id(claimed_session_id)
        if session_id is None or self.session_model is None:
            return False
        user_db = user_manager.user_db
        if not isinstance(user_db, SQLAlchemyUserDatabase):
            raise TypeError("IatJWTStrategy checks phone sessions through SQLAlchemyUserDatabase")
        return await refresh_session_repo.exists_owned(
            user_db.session, self.session_model, user.id, session_id,
        )

    async def write_token(self, user: models.UP) -> str:
        now = int(time.time())
        return self._write(user, issued_at=now, auth_time=now)

    async def write_session_token(
        self, user: models.UP, *, auth_time: datetime, session_id: uuid.UUID | None = None,
    ) -> str:
        """A token for a session that proved who the user is at ``auth_time``."""
        return self._write(
            user,
            issued_at=int(time.time()),
            auth_time=int(auth_time.timestamp()),
            session_id=None if session_id is None else str(session_id),
        )

    def session_id_of(self, token: str) -> uuid.UUID | None:
        """The refresh session a token this server signed belongs to, if it has one."""
        return _parse_session_id(self._signed_claims(token).get("sid"))

    async def reissue(self, user: models.UP, token: str) -> str:
        """The caller's token again, issued now, for after a session cutoff.

        Keeps its ``auth_time``, its ``sid`` and its lifetime, so a phone's token still
        lasts as long as a phone's should, and nothing about the sign-in grows older or
        newer. A token without ``auth_time`` gets 0: it proves no recent sign-in.
        """
        claims = self._signed_claims(token)
        issued_at, expires_at = claims.get("iat"), claims.get("exp")
        lifetime = (
            expires_at - issued_at
            if isinstance(issued_at, int) and isinstance(expires_at, int)
            else self.lifetime_seconds
        )
        auth_time = claims.get("auth_time")
        session_id = claims.get("sid")
        return self._write(
            user,
            issued_at=int(time.time()),
            auth_time=auth_time if isinstance(auth_time, int) else 0,
            session_id=session_id if isinstance(session_id, str) else None,
            lifetime_seconds=lifetime,
        )

    def _signed_claims(self, token: str) -> dict[str, Any]:
        """The claims of a token this server signed, expired or not.

        Only for a token the request was just authenticated with: it may expire in
        between, and the caller is still the one who sent it.
        """
        key = self.decode_key
        return jwt.decode(
            token,
            key.get_secret_value() if isinstance(key, SecretStr) else key,
            audience=self.token_audience,
            algorithms=[self.algorithm],
            options={"verify_exp": False},
        )

    def _write(
        self,
        user: models.UP,
        *,
        issued_at: int,
        auth_time: int,
        session_id: str | None = None,
        lifetime_seconds: int | None = None,
    ) -> str:
        data: dict[str, Any] = {
            "sub": str(user.id),
            "aud": self.token_audience,
            "iat": issued_at,
            "auth_time": auth_time,
        }
        if session_id is not None:
            data["sid"] = session_id
        return generate_jwt(
            data,
            self.encode_key,
            self.lifetime_seconds if lifetime_seconds is None else lifetime_seconds,
            algorithm=self.algorithm,
        )


def _parse_session_id(claimed: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(claimed) if isinstance(claimed, str) else None
    except ValueError:
        return None


class JwtAuthBackend(NamedTuple):
    """Bundle of the three fastapi-users auth wiring objects.

    Apps destructure this at module level so existing imports (e.g.
    ``from app.core.auth import auth_backend``) keep working.
    """

    bearer_transport: BearerTransport
    get_jwt_strategy: object  # Callable[[], JWTStrategy] — mypy-friendly
    auth_backend: AuthenticationBackend


def build_jwt_auth_backend(
    *,
    secret_key: str,
    lifetime_seconds: int,
    session_model: type[Any],
    token_url: str = "auth/jwt/login",
    backend_name: str = "jwt",
) -> JwtAuthBackend:
    """Construct the fastapi-users JWT auth wiring.

    Args:
        secret_key: HMAC secret for token signing. Apps pass
            ``settings.secret_key``.
        lifetime_seconds: Token TTL. Apps pass
            ``settings.jwt_lifetime_seconds``.
        session_model: The app's ``RefreshSession`` model. A phone's token is
            refused once its session is signed out.
        token_url: ``BearerTransport`` token URL. Defaults to the
            convention both apps use today (``"auth/jwt/login"``).
        backend_name: ``AuthenticationBackend`` name. Defaults to
            ``"jwt"`` matching both apps.

    Returns:
        ``JwtAuthBackend(bearer_transport, get_jwt_strategy, auth_backend)``
        — apps destructure into module-level names.
    """
    bearer_transport = BearerTransport(tokenUrl=token_url)

    def get_jwt_strategy() -> IatJWTStrategy:
        return IatJWTStrategy(
            secret=secret_key, lifetime_seconds=lifetime_seconds, session_model=session_model,
        )

    auth_backend = AuthenticationBackend(
        name=backend_name,
        transport=bearer_transport,
        get_strategy=get_jwt_strategy,
    )

    return JwtAuthBackend(
        bearer_transport=bearer_transport,
        get_jwt_strategy=get_jwt_strategy,
        auth_backend=auth_backend,
    )


__all__ = ["IatJWTStrategy", "JwtAuthBackend", "build_jwt_auth_backend"]
