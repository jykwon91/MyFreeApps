"""The signed-in user, with the connection that looked them up already handed back."""
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.db.session import release_connection


def released_current_user(
    current_active_user: Callable[..., Awaitable[Any]],
    get_db: Callable[..., AsyncIterator[AsyncSession]],
) -> Callable[..., Awaitable[Any]]:
    """Wrap ``current_active_user`` for routes whose work runs in its own transactions.

    Looking up the user leaves a transaction open on the request's session. Holding it
    while waiting for a second connection lets a burst of requests use up the pool.
    """

    async def dependency(
        user: Any = Depends(current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> Any:
        await release_connection(db)
        return user

    return dependency
