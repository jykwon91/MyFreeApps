"""The shape of an app's ``prepare_deletion`` hook for account deletion."""
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

AfterCommit = Callable[[], None]

# Runs in the deletion's transaction, before the user row goes. Raises
# ``AccountDeletionBlockedError`` to refuse. Returns work to run after the
# commit, for what a rollback couldn't undo, or None when there is none.
PrepareDeletion = Callable[[AsyncSession, Any], Awaitable[AfterCommit | None]]
