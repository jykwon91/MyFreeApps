"""What MyJobHunter has to do around deleting a user's row."""
from collections.abc import Callable
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.user.user import User
from app.repositories.user import account_files_repo
from platform_shared.services.stored_file_removal import remove_stored_files


async def prepare_deletion(db: AsyncSession, user: User) -> Callable[[], None]:
    """Collect this user's stored files before their rows cascade away.

    Returns what to run once the deletion commits: removing stored files can't
    be undone by a rollback, so it can't happen before then.
    """
    storage_keys = await account_files_repo.list_storage_keys(db, user.id)
    return partial(remove_stored_files, get_storage, storage_keys)
