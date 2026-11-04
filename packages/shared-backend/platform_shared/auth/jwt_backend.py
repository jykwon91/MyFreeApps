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
from datetime import datetime
from typing import Generic, NamedTuple

import jwt
from fastapi_users import models
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.jwt import decode_jwt, generate_jwt
from fastapi_users.manager import BaseUserManager

from platform_shared.auth.session_invalidation import is_issued_before_cutoff


class IatJWTStrategy(JWTStrategy[models.UP, models.ID], Generic[models.UP, models.ID]):
    """JWTStrategy that adds ``iat`` and ``auth_time`` claims.

    fastapi-users 15.x ``JWTStrategy.write_token`` emits only ``sub``,
    ``aud``, and ``exp``. The platform needs two more:

    - ``iat``, when this token was issued. A token issued before the user's
      session cutoff stops working.
    - ``auth_time``, when the user last proved who they are. The strict-superuser
      gate (``platform_shared.core.permissions.make_strict_superuser_gate``)
      reads it to enforce a recent-auth window.

    They're separate because a token renewed without a login would get a new
    ``iat`` while the user's proof of identity stays as old as it was.
    """

    async def read_token(
        self, token: str | None, user_manager: BaseUserManager[models.UP, models.ID],
    ) -> models.UP | None:
        """Reject a valid token issued before the user's session cutoff."""
        user = await super().read_token(token, user_manager)
        if user is None or user.auth_valid_after is None:
            return user
        try:
            issued_at = decode_jwt(
                token, self.decode_key, self.token_audience, algorithms=[self.algorithm],
            ).get("iat")
        except jwt.PyJWTError:
            return None
        if not isinstance(issued_at, int) or is_issued_before_cutoff(issued_at, user.auth_valid_after):
            return None
        return user

    async def write_token(self, user: models.UP) -> str:
        now = int(time.time())
        return self._write(user, issued_at=now, auth_time=now)

    async def write_session_token(self, user: models.UP, *, auth_time: datetime) -> str:
        """A token for a session that proved who the user is at ``auth_time``."""
        return self._write(user, issued_at=int(time.time()), auth_time=int(auth_time.timestamp()))

    def _write(self, user: models.UP, *, issued_at: int, auth_time: int) -> str:
        data = {
            "sub": str(user.id),
            "aud": self.token_audience,
            "iat": issued_at,
            "auth_time": auth_time,
        }
        return generate_jwt(
            data, self.encode_key, self.lifetime_seconds, algorithm=self.algorithm,
        )


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
    token_url: str = "auth/jwt/login",
    backend_name: str = "jwt",
) -> JwtAuthBackend:
    """Construct the fastapi-users JWT auth wiring.

    Args:
        secret_key: HMAC secret for token signing. Apps pass
            ``settings.secret_key``.
        lifetime_seconds: Token TTL. Apps pass
            ``settings.jwt_lifetime_seconds``.
        token_url: ``BearerTransport`` token URL. Defaults to the
            convention both apps use today (``"auth/jwt/login"``).
        backend_name: ``AuthenticationBackend`` name. Defaults to
            ``"jwt"`` matching both apps.

    Returns:
        ``JwtAuthBackend(bearer_transport, get_jwt_strategy, auth_backend)``
        — apps destructure into module-level names.
    """
    bearer_transport = BearerTransport(tokenUrl=token_url)

    def get_jwt_strategy() -> JWTStrategy:
        return IatJWTStrategy(secret=secret_key, lifetime_seconds=lifetime_seconds)

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
