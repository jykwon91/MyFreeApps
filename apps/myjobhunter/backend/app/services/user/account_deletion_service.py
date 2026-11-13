"""What MyJobHunter has to do around deleting a user's row."""
from collections.abc import Callable
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.user.user import User
from app.repositories.application import application_repository
from app.repositories.discovery import discovered_job_deletion_repository
from app.repositories.user import account_files_repo
from platform_shared.services.stored_file_removal import remove_stored_files


async def prepare_deletion(db: AsyncSession, user: User) -> Callable[[], None]:
    """Collect this user's stored files, then clear what would block the cascade.

    ``applications.company_id`` is RESTRICT and Postgres checks it immediately, so
    deleting the user only works if applications cascade before companies. Deleting
    the applications here makes that order explicit rather than a matter of luck.

    Discovered postings go first. A promoted posting's ``promoted_application_id``
    is ``ON DELETE SET NULL``, and ``chk_discovered_promoted`` rejects a posting
    that keeps ``promoted_at`` once its application id is gone, so deleting the
    applications while their postings still exist fails the whole deletion.

    Returns what to run once the deletion commits: removing stored files can't
    be undone by a rollback, so it can't happen before then.
    """
    storage_keys = await account_files_repo.list_storage_keys(db, user.id)
    await discovered_job_deletion_repository.delete_all_for_user(db, user.id)
    await application_repository.delete_all_for_user(db, user.id)
    return partial(remove_stored_files, get_storage, storage_keys)
