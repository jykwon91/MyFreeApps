"""Whether an insurance policy records a stored file, for a commit-outcome check."""
from __future__ import annotations

import uuid

from platform_shared.services.storage.rows_present import RowsPresent

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.db.session import unit_of_work
from app.repositories import lock_timeout_repo
from app.repositories.insurance import insurance_policy_attachment_repo, insurance_policy_repo


def attachment_present_check(
    policy_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID, storage_key: str,
) -> RowsPresent:
    """Whether the attachment row exists.

    Takes the policy lock first (bounded by a lock timeout), which waits for the
    original transaction to finish; a timeout or any error leaves the outcome
    unknown. A soft-deleted policy keeps its attachments; a policy that is gone
    took them with it.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            await lock_timeout_repo.set_local_lock_timeout(db, OUTCOME_CHECK_LOCK_TIMEOUT_MS)
            policy = await insurance_policy_repo.get(
                db,
                policy_id=policy_id,
                user_id=user_id,
                organization_id=organization_id,
                include_deleted=True,
                for_update=True,
            )
            if policy is None:
                return False
            rows = await insurance_policy_attachment_repo.list_by_policy(db, policy_id)
        return any(r.storage_key == storage_key for r in rows)

    return rows_present
