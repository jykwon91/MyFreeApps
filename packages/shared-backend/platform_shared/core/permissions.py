"""Platform-level role enum + admin dependency.

Foundation slice of the broader RBAC contract. Apps that need the full
organization + members + per-org roles tier can layer on top of this
in their own ``app/core/permissions.py`` (see
apps/mybookkeeper/backend/app/core/permissions.py for the canonical
example), but the simple "is the user a platform admin" check
belongs here so every app gets it for free.

Scope of THIS module:

  - ``Role`` enum (ADMIN | USER) — single column on the User table
  - ``require_role(*roles)`` dependency factory
  - ``current_admin`` — pre-baked dependency for admin-only routes

Explicitly NOT in scope (belongs in app-level permissions.py):

  - Organization / OrganizationMember / OrgRole
  - ``current_org_member`` and ``require_write_access`` /
    ``require_org_role`` dependencies
  - Demo-org rejection helpers
  - Anything that reads the X-Organization-Id header

This module has zero coupling to any organization schema. The single
``user.role`` column is sufficient to enforce platform-level admin
gates for routes like ``/admin/auth-events``, ``/admin/storage-health``,
or ``/admin/users``.

Apps must declare a ``role`` column on their User model that uses
this enum:

    from platform_shared.core.permissions import Role

    class User(SQLAlchemyBaseUserTableUUID, Base):
        role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.USER)
"""
from __future__ import annotations

import enum
import time
import uuid
from collections.abc import AsyncIterator
from typing import Awaitable, Callable, Optional, Protocol

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event


class Role(str, enum.Enum):
    """Platform-level user role.

    Apps that need finer-grained per-organization roles should layer
    those in their own permissions module on top of this one — keep
    the platform-level enum minimal.
    """

    ADMIN = "admin"
    USER = "user"


class _RoleHolder(Protocol):
    """Anything with a ``role`` attribute exposing a ``Role``.

    Used to type the ``require_role`` factory's dependency without
    coupling to any specific User model — apps' own User class
    satisfies this Protocol structurally.
    """

    role: Role


def require_role(
    *roles: Role,
    current_active_user: Callable[..., Awaitable[_RoleHolder]],
) -> Callable[..., Awaitable[_RoleHolder]]:
    """Build a FastAPI dependency that gates a route on user.role.

    Args:
        *roles: Allowed Role values. The user's role must be in this
            set or the dependency raises 403.
        current_active_user: The app's ``current_active_user``
            dependency from fastapi-users — passed in so this module
            stays decoupled from any specific User model. Each app
            wires its own.

    Example (in app/core/permissions.py):

        from platform_shared.core.permissions import Role, require_role
        from app.core.auth import current_active_user

        require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)

    Then in route handlers:

        @router.get("/admin/auth-events", dependencies=[Depends(require_admin)])
        async def list_auth_events(...): ...

    Raises:
        HTTPException 403 with detail "Insufficient permissions" when
        the user's role is not in the allowed set.
    """

    async def _check(user: _RoleHolder = Depends(current_active_user)) -> _RoleHolder:
        if user.role not in roles:
            raise HTTPException(
                status_code=403, detail="Insufficient permissions"
            )
        return user

    return _check


class _SuperuserHolder(Protocol):
    """Anything with an ``is_superuser`` attribute. Used to type
    ``make_current_superuser`` without coupling to any specific User model.
    """

    is_superuser: bool


def make_current_superuser(
    current_active_user: Callable[..., Awaitable[_SuperuserHolder]],
) -> Callable[..., Awaitable[_SuperuserHolder]]:
    """Build a FastAPI dependency that gates a route on ``user.is_superuser``.

    Args:
        current_active_user: The app's ``current_active_user`` dependency
            from fastapi-users — passed in so this module stays decoupled
            from any specific User model. Each app wires its own.

    Example (in app/core/permissions.py):

        from platform_shared.core.permissions import make_current_superuser
        from app.core.auth import current_active_user

        current_superuser = make_current_superuser(current_active_user)

    Raises:
        HTTPException 403 with detail "Superuser access required" when
        ``user.is_superuser`` is not True.
    """

    async def _check(
        user: _SuperuserHolder = Depends(current_active_user),
    ) -> _SuperuserHolder:
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Superuser access required")
        return user

    return _check


# ---------------------------------------------------------------------------
# Strict superuser gate (defense-in-depth)
# ---------------------------------------------------------------------------


class _StrictSuperuserUser(Protocol):
    """A user with the attributes the strict gate needs to evaluate."""

    id: uuid.UUID
    is_superuser: bool


def make_strict_superuser_gate(
    *,
    current_active_user: Callable[..., Awaitable[_StrictSuperuserUser]],
    get_db: Callable[..., AsyncIterator[AsyncSession]],
    verify_totp_step_up: Callable[[AsyncSession, uuid.UUID, str], Awaitable[None]],
    decode_token_iat: Callable[[Request], Optional[float]],
    max_token_age_seconds: int = 900,
) -> Callable[..., Awaitable[_StrictSuperuserUser]]:
    """Build a hardened FastAPI dependency for superuser-only routes.

    Three independent gates layered for defense-in-depth:

    1. ``user.is_superuser`` — the JWT-bound role check (weakest gate; a
       stolen JWT alone passes this).
    2. **Recent re-auth** — JWT's ``iat`` claim must be within
       ``max_token_age_seconds`` of now. Default 15 minutes. Forces the
       user to log in again before issuing destructive admin actions.
    3. **TOTP step-up** — the request must include an ``X-TOTP-Code``
       header with a fresh valid 6-digit code. Even if a bad actor has
       a stolen, fresh JWT, they cannot exploit this gate without a
       second factor.

    Every evaluation (pass or each fail mode) writes an auth_event row
    via the shared ``log_auth_event`` helper for SOC visibility and
    incident-response forensics. The event type is one of:

    - :py:attr:`AuthEventType.SUPERUSER_GATE_PASSED`
    - :py:attr:`AuthEventType.SUPERUSER_GATE_DENIED_NOT_SUPERUSER`
    - :py:attr:`AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_NO_IAT`
    - :py:attr:`AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_STALE`
    - :py:attr:`AuthEventType.SUPERUSER_GATE_DENIED_MISSING_TOTP`
    - :py:attr:`AuthEventType.SUPERUSER_GATE_DENIED_BAD_TOTP`

    Args:
        current_active_user: The app's fastapi-users ``current_active_user``
            dependency. Resolves the JWT to a User-shaped object.
        get_db: The app's ``get_db`` dependency. The gate uses it to
            write auth_event rows; the caller's transaction commits.
        verify_totp_step_up: A callable taking ``(db, user_id, totp_code)``
            that raises ``HTTPException`` if the code is invalid. Apps wire
            their own implementation against the shared totp service.
        decode_token_iat: A callable taking ``(request)`` that returns the
            JWT's ``iat`` claim (Unix timestamp) or ``None`` if the JWT
            cannot be decoded or has no iat. The gate uses this to enforce
            the recent-auth window.
        max_token_age_seconds: The recent-auth window. Default 900s
            (15 minutes). Tokens older than this are rejected with 401.

    Returns:
        An async FastAPI dependency that can be used like:

        ```
        @router.delete("/admin/dangerous-action", dependencies=[Depends(strict_superuser)])
        async def dangerous_action(...): ...
        ```

    Defense rationale:
        Superuser endpoints can promote/demote any user, wipe data, and
        access cross-tenant data. JWT theft alone must NOT be sufficient
        to invoke them. The three gates defeat: token theft (step-up),
        long-lived sessions (recent-auth), and the simple JWT bypass
        (is_superuser). Audit logging gives SOC a forensic trail of
        every attempt.
    """

    async def _check(
        request: Request,
        user: _StrictSuperuserUser = Depends(current_active_user),
        x_totp_code: Optional[str] = Header(default=None, alias="X-TOTP-Code"),
        db: AsyncSession = Depends(get_db),
    ) -> _StrictSuperuserUser:
        path = request.url.path

        # Gate 1: is_superuser
        if not user.is_superuser:
            await log_auth_event(
                db,
                event_type=AuthEventType.SUPERUSER_GATE_DENIED_NOT_SUPERUSER,
                user_id=user.id,
                request=request,
                succeeded=False,
                metadata={"path": path},
            )
            raise HTTPException(status_code=403, detail="Superuser access required")

        # Gate 2: recent re-auth (JWT iat must be within window)
        iat = decode_token_iat(request)
        if iat is None:
            await log_auth_event(
                db,
                event_type=AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_NO_IAT,
                user_id=user.id,
                request=request,
                succeeded=False,
                metadata={"path": path},
            )
            raise HTTPException(
                status_code=401, detail="Token missing or unreadable iat claim"
            )

        age_seconds = int(time.time() - iat)
        if age_seconds > max_token_age_seconds:
            await log_auth_event(
                db,
                event_type=AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_STALE,
                user_id=user.id,
                request=request,
                succeeded=False,
                metadata={
                    "path": path,
                    "age_s": age_seconds,
                    "max_age_s": max_token_age_seconds,
                },
            )
            raise HTTPException(
                status_code=401,
                detail="Re-authenticate (session too old for this action)",
                headers={"X-Require-Step-Up": "reauth"},
            )

        # Gate 3: TOTP step-up
        if not x_totp_code:
            await log_auth_event(
                db,
                event_type=AuthEventType.SUPERUSER_GATE_DENIED_MISSING_TOTP,
                user_id=user.id,
                request=request,
                succeeded=False,
                metadata={"path": path},
            )
            raise HTTPException(
                status_code=401,
                detail="TOTP step-up required",
                headers={"X-Require-Step-Up": "totp"},
            )

        try:
            await verify_totp_step_up(db, user.id, x_totp_code)
        except HTTPException:
            await log_auth_event(
                db,
                event_type=AuthEventType.SUPERUSER_GATE_DENIED_BAD_TOTP,
                user_id=user.id,
                request=request,
                succeeded=False,
                metadata={"path": path},
            )
            raise

        # All three gates passed — emit pass event and admit
        await log_auth_event(
            db,
            event_type=AuthEventType.SUPERUSER_GATE_PASSED,
            user_id=user.id,
            request=request,
            succeeded=True,
            metadata={"path": path},
        )
        return user

    return _check
