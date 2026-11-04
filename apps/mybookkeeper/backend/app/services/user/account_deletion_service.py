"""What MyBookkeeper has to clear before a user's row can be deleted."""
import logging
from collections.abc import Callable
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_deletion_constants import (
    HOLDS_SHARED_RECORDS_MESSAGE,
    OWNS_SHARED_WORKSPACE_MESSAGE,
)
from app.core.storage import get_storage
from app.models.user.user import User
from app.repositories import organization_repo, user_repo
from app.repositories.leases import signed_lease_repo
from app.repositories.user import account_files_repo
from platform_shared.services.account_deletion import AccountDeletionBlockedError

logger = logging.getLogger(__name__)


def remove_stored_files(storage_keys: list[str]) -> None:
    """Delete an account's stored files once its rows are gone.

    The account can't come back by now, so one failure mustn't stop the rest.
    Anything left is logged by key, which is all that's needed to remove it. The
    keys are only in memory, so a restart before this runs leaves files with no
    record of them.
    """
    for key in storage_keys:
        try:
            get_storage().delete_file(key)
        except Exception:
            logger.exception("Stored file left behind after account deletion: key=%s", key)


async def prepare_deletion(db: AsyncSession, user: User) -> Callable[[], None]:
    """Delete this user's own workspaces; refuse if that would cost anyone else.

    Deleting a user cascades through every row they wrote, and nothing can hand
    a workspace or its records to someone else. So once their own workspaces
    are gone, anything still pointing at them belongs to another workspace,
    whether they're still a member of it or were removed. Refusing raises out
    of the caller's transaction, which puts the workspaces back.

    Workspaces go first because ``organizations.created_by`` doesn't cascade.
    Their signed leases go before that because ``signed_leases.applicant_id``
    is RESTRICT, which Postgres checks at once: a cascade reaching an applicant
    before its lease would fail even though the lease was about to go too.

    Returns what to run once that commits: removing stored files can't be undone
    by a rollback, so it can't happen before the refusals are behind us.
    """
    if await organization_repo.created_workspace_has_other_members(db, user.id):
        raise AccountDeletionBlockedError(OWNS_SHARED_WORKSPACE_MESSAGE)
    workspaces = await organization_repo.list_created_by(db, user.id)
    storage_keys = await account_files_repo.list_storage_keys(db, [workspace.id for workspace in workspaces])
    for workspace in workspaces:
        await signed_lease_repo.hard_delete_for_organization(db, workspace.id)
        await organization_repo.delete(db, workspace)
    await db.flush()
    if await user_repo.holds_shared_records(db, user.id):
        raise AccountDeletionBlockedError(HOLDS_SHARED_RECORDS_MESSAGE)
    return partial(remove_stored_files, storage_keys)
