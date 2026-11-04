"""The ``/users`` routes every app mounts.

fastapi-users guards ``DELETE /users/{id}`` with a plain superuser check, so a
stolen admin token alone could delete any account. Here it sits behind the strict
gate, like the other destructive admin routes.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.routing import APIRoute
from fastapi_users import FastAPIUsers, exceptions, schemas

_LIBRARY_DELETE_ROUTE = "users:delete_user"


def build_users_router(
    *,
    fastapi_users: FastAPIUsers[Any, Any],
    user_read: type[schemas.BaseUser[Any]],
    user_update: type[schemas.CreateUpdateDictModel],
    current_strict_superuser: Callable[..., Awaitable[Any]],
) -> APIRouter:
    """Build the fastapi-users router with the delete route behind the strict gate.

    Args:
        fastapi_users: The app's ``FastAPIUsers`` instance.
        user_read: The app's ``UserRead`` schema.
        user_update: The app's ``UserUpdate`` schema.
        current_strict_superuser: The app's strict gate from
            ``make_strict_superuser_gate``.
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
        dependencies=[Depends(current_strict_superuser)],
        name=_LIBRARY_DELETE_ROUTE,
    )
    async def delete_user(
        id: str,
        request: Request,
        user_manager: Any = Depends(fastapi_users.get_user_manager),
    ) -> None:
        try:
            user = await user_manager.get(user_manager.parse_id(id))
        except (exceptions.InvalidID, exceptions.UserNotExists) as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        await user_manager.delete(user, request=request)

    return router


__all__ = ["build_users_router"]
