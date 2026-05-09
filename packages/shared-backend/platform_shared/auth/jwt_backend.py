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

from typing import NamedTuple

from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
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
        return JWTStrategy(secret=secret_key, lifetime_seconds=lifetime_seconds)

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


__all__ = ["JwtAuthBackend", "build_jwt_auth_backend"]
