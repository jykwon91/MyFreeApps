"""The ``/users`` routes every app mounts.

fastapi-users guards ``DELETE /users/{id}`` with a plain superuser check, so a
stolen admin token alone could delete any account. Here it sits behind the strict
gate, like the other destructive admin routes.

The library's delete also removes only the user row. Here it runs the same
deletion as ``DELETE /users/me``: the app's ``prepare_deletion``, the
``ACCOUNT_DELETED`` auth event, and the erasure of the user's ``audit_logs``
values, in one transaction.
"""
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.routing import APIRoute
from fastapi_users import FastAPIUsers, exceptions, schemas

from platform_shared.core.account_deleted_by import AccountDeletedBy
from platform_shared.db.session import release_connection, unit_of_work_on_same_database
from platform_shared.services.account_already_deleted_error import (
    AccountAlreadyDeletedError,
)
from platform_shared.services.account_deletion import (
    AccountDeletionBlockedError,
    delete_account_and_erase_history,
)
from platform_shared.services.prepare_deletion import PrepareDeletion

_LIBRARY_DELETE_ROUTE = "users:delete_user"


def build_users_router(
    *,
    fastapi_users: FastAPIUsers[Any, Any],
    user_read: type[schemas.BaseUser[Any]],
    user_update: type[schemas.CreateUpdateDictModel],
    current_strict_superuser: Callable[..., Awaitable[Any]],
    prepare_deletion: PrepareDeletion | None = None,
) -> APIRouter:
    """Build the fastapi-users router with the delete route behind the strict gate.

    Args:
        fastapi_users: The app's ``FastAPIUsers`` instance.
        user_read: The app's ``UserRead`` schema.
        user_update: The app's ``UserUpdate`` schema.
        current_strict_superuser: The app's strict gate from
            ``make_strict_superuser_gate``.
        prepare_deletion: The same hook the app passes to
            ``build_account_deletion_router``, so an admin's delete clears
            what the user's own would. A refusal is a 409.
    """
    router = fastapi_users.get_users_router(user_read, user_update)
    router.routes = [
        route
        for route in router.routes
        if not (isinstance(route, APIRoute) and route.name == _LIBRARY_DELETE_ROUTE)
    ]

    @router.delete(
        "/{id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
        name=_LIBRARY_DELETE_ROUTE,
    )
    async def delete_user(
        id: str,
        request: Request,
        background_tasks: BackgroundTasks,
        admin: Annotated[Any, Depends(current_strict_superuser)],
        user_manager: Annotated[Any, Depends(fastapi_users.get_user_manager)],
    ) -> None:
        try:
            user = await user_manager.get(user_manager.parse_id(id))
        except (exceptions.InvalidID, exceptions.UserNotExists) as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        session = user_manager.user_db.session
        await release_connection(session)
        try:
            async with unit_of_work_on_same_database(session) as txn_db:
                after_commit = await delete_account_and_erase_history(
                    txn_db,
                    user,
                    prepare_deletion,
                    request=request,
                    deleted_by=AccountDeletedBy.ADMIN,
                    actor_id=admin.id,
                )
        except AccountAlreadyDeletedError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        except AccountDeletionBlockedError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if after_commit is not None:
            background_tasks.add_task(after_commit)

    return router


__all__ = ["build_users_router"]
