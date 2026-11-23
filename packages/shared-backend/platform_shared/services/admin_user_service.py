"""Shared admin user-management service.

Each app instantiates ``AdminUserService`` with its own User model and
the app's transactional unit-of-work helper. The service contains the
business logic (self-targeting guards, audit-log statements,
permission checks); the surrounding transaction is the caller's
responsibility.

Usage (per app):

    from platform_shared.services.admin_user_service import AdminUserService
    from app.db.session import unit_of_work, AsyncSessionLocal
    from app.models.user.user import User

    admin_user_service = AdminUserService(
        user_model=User,
        unit_of_work=unit_of_work,
        async_session_factory=AsyncSessionLocal,
    )
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from typing import Any, Generic, TypeVar

from platform_shared.core.permissions import Role
from platform_shared.repositories import admin_user_repo
from platform_shared.schemas.admin_user import UserStats
from platform_shared.services.admin_target_user_not_found_error import AdminTargetUserNotFoundError

logger = logging.getLogger(__name__)

TUser = TypeVar("TUser")


class AdminUserService(Generic[TUser]):
    """Per-app admin user service. Holds the User model + db helpers.

    Args:
        user_model: The app's SQLAlchemy User class.
        unit_of_work: Callable returning an async context manager that
            yields an ``AsyncSession`` inside a transaction. Mirrors
            each app's ``app.db.session.unit_of_work``.
        async_session_factory: Callable returning a fresh
            ``AsyncSession`` for read-only flows where the service
            opens its own session. Mirrors each app's
            ``app.db.session.AsyncSessionLocal``.
    """

    def __init__(
        self,
        *,
        user_model: type[TUser],
        unit_of_work: Callable[[], AbstractAsyncContextManager[Any]],
        async_session_factory: Callable[[], AbstractAsyncContextManager[Any]],
    ) -> None:
        self._user_model = user_model
        self._unit_of_work = unit_of_work
        self._async_session_factory = async_session_factory

    async def list_users(
        self, *, limit: int = 50, offset: int = 0,
    ) -> Sequence[TUser]:
        """Return a page of users, ordered by email.

        Defaults to 50 per page so an admin-token compromise yields one
        page at a time, not the full table. Callers asking for a full
        export must paginate explicitly.
        """
        async with self._async_session_factory() as db:
            return await admin_user_repo.list_all(
                db, self._user_model, limit=limit, offset=offset,
            )

    async def is_superuser_target(self, user_id: uuid.UUID) -> bool:
        """Whether the user exists and is a superuser.

        The admin router uses this to demand step-up before an action on a
        superuser. A missing user reads as False; the action then answers 404.
        """
        async with self._async_session_factory() as db:
            target = await admin_user_repo.get_by_id(
                db, self._user_model, user_id,
            )
            return bool(getattr(target, "is_superuser", False))

    async def update_user_role(
        self, user_id: uuid.UUID, role: Role, admin: TUser,
    ) -> TUser:
        """Change a user's role.

        Raises:
            PermissionError: when the target is a superuser and the
                admin is not.
            ValueError: when the admin tries to change their own role.
            AdminTargetUserNotFoundError: when the target user does not exist.
        """
        if user_id == _admin_id(admin):
            raise ValueError("Cannot change your own role")

        async with self._unit_of_work() as db:
            target = await admin_user_repo.get_by_id(
                db, self._user_model, user_id,
            )
            if target is None:
                raise AdminTargetUserNotFoundError()
            _ensure_may_modify(target, admin)

            old_role = getattr(target, "role", None)
            result = await admin_user_repo.update_role(db, target, role)
            logger.info(
                "ADMIN_ACTION role_change admin=%s target=%s old=%s new=%s",
                _admin_id(admin),
                getattr(target, "id", None),
                getattr(old_role, "value", old_role),
                role.value,
            )
            return result

    async def deactivate_user(
        self, user_id: uuid.UUID, admin: TUser,
    ) -> TUser:
        """Set is_active=False on a user.

        Raises:
            PermissionError: when the target is a superuser and the
                admin is not.
            ValueError: when the admin tries to deactivate themselves.
            AdminTargetUserNotFoundError: when the target user does not exist.
        """
        if user_id == _admin_id(admin):
            raise ValueError("Cannot deactivate yourself")

        async with self._unit_of_work() as db:
            target = await admin_user_repo.get_by_id(
                db, self._user_model, user_id,
            )
            if target is None:
                raise AdminTargetUserNotFoundError()
            _ensure_may_modify(target, admin)

            result = await admin_user_repo.set_active(
                db, target, is_active=False,
            )
            logger.info(
                "ADMIN_ACTION deactivate admin=%s target=%s",
                _admin_id(admin),
                getattr(target, "id", None),
            )
            return result

    async def activate_user(
        self, user_id: uuid.UUID, admin: TUser,
    ) -> TUser:
        """Set is_active=True on a user.

        Raises:
            PermissionError: when the target is a superuser and the
                admin is not.
            ValueError: when the admin tries to activate themselves.
            AdminTargetUserNotFoundError: when the target user does not exist.
        """
        if user_id == _admin_id(admin):
            raise ValueError("Cannot activate yourself")

        async with self._unit_of_work() as db:
            target = await admin_user_repo.get_by_id(
                db, self._user_model, user_id,
            )
            if target is None:
                raise AdminTargetUserNotFoundError()
            _ensure_may_modify(target, admin)

            result = await admin_user_repo.set_active(
                db, target, is_active=True,
            )
            logger.info(
                "ADMIN_ACTION activate admin=%s target=%s",
                _admin_id(admin),
                getattr(target, "id", None),
            )
            return result

    async def toggle_superuser(
        self, user_id: uuid.UUID, admin: TUser,
    ) -> TUser:
        """Flip the is_superuser flag.

        Raises:
            PermissionError: when the calling admin is not themselves a
                superuser.
            ValueError: when the admin tries to change their own flag.
            AdminTargetUserNotFoundError: when the target user does not exist.
        """
        if not getattr(admin, "is_superuser", False):
            raise PermissionError(
                "Only superusers can toggle superuser status",
            )
        if user_id == _admin_id(admin):
            raise ValueError("Cannot change your own superuser status")

        async with self._unit_of_work() as db:
            target = await admin_user_repo.get_by_id(
                db, self._user_model, user_id,
            )
            if target is None:
                raise AdminTargetUserNotFoundError()

            new_status = not bool(getattr(target, "is_superuser", False))
            result = await admin_user_repo.set_superuser(
                db, target, is_superuser=new_status,
            )
            logger.info(
                "ADMIN_ACTION superuser_toggle admin=%s target=%s is_superuser=%s",
                _admin_id(admin),
                getattr(target, "id", None),
                new_status,
            )
            return result

    async def get_user_stats(self) -> UserStats:
        """Return total / active / inactive user counts."""
        async with self._async_session_factory() as db:
            total, active, inactive = await admin_user_repo.count_users(
                db, self._user_model,
            )
            return UserStats(
                total_users=total,
                active_users=active,
                inactive_users=inactive,
            )


def _ensure_may_modify(target: Any, admin: Any) -> None:
    """Only a superuser may act on a superuser, so an admin cannot lock one out."""
    if getattr(target, "is_superuser", False) and not getattr(
        admin, "is_superuser", False,
    ):
        raise PermissionError("Only superusers can modify a superuser")


def _admin_id(admin: Any) -> Any:
    """Best-effort extraction of the admin's id, supporting tests with mocks."""
    return getattr(admin, "id", None)
