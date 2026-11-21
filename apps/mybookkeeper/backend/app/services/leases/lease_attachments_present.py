"""Whether a lease records any of a set of stored files, for a commit-outcome check."""
from __future__ import annotations

import uuid

from platform_shared.services.storage.rows_present import RowsPresent

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.db.session import unit_of_work
from app.repositories import lock_timeout_repo
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo


def attachments_present_check(
    lease_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID, keys: list[str],
) -> RowsPresent:
    """A check that some of ``keys`` are recorded on the lease.

    Takes the lease row lock first (bounded by a lock timeout), which waits for
    the original transaction to finish; a timeout or any error leaves the
    outcome unknown.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            await lock_timeout_repo.set_local_lock_timeout(db, OUTCOME_CHECK_LOCK_TIMEOUT_MS)
            await signed_lease_repo.get(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                include_deleted=True,
                for_update=True,
            )
            rows = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
        return bool({r.storage_key for r in rows} & set(keys))

    return rows_present
