"""What MyBookkeeper has to clear before a user's row can be deleted."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_deletion_constants import (
    HOLDS_SHARED_RECORDS_MESSAGE,
    OWNS_SHARED_WORKSPACE_MESSAGE,
)
from app.models.user.user import User
from app.repositories import organization_repo, user_repo
from app.repositories.leases import signed_lease_repo
from platform_shared.services.account_deletion import AccountDeletionBlockedError


async def prepare_deletion(db: AsyncSession, user: User) -> None:
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
    """
    if await organization_repo.created_workspace_has_other_members(db, user.id):
        raise AccountDeletionBlockedError(OWNS_SHARED_WORKSPACE_MESSAGE)
    for workspace in await organization_repo.list_created_by(db, user.id):
        await signed_lease_repo.hard_delete_for_organization(db, workspace.id)
        await organization_repo.delete(db, workspace)
    await db.flush()
    if await user_repo.holds_shared_records(db, user.id):
        raise AccountDeletionBlockedError(HOLDS_SHARED_RECORDS_MESSAGE)
