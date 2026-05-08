from datetime import datetime, timezone
from typing import Any, Protocol


class SupportsSoftDelete(Protocol):
    deleted_at: datetime | None


async def soft_delete(
    db: Any,
    instance: SupportsSoftDelete,
    *,
    deleted_at_field: str = "deleted_at",
) -> bool:
    """Set the deleted_at column on `instance` to now (UTC) if not already set.

    Idempotent. Returns True if newly soft-deleted, False if it was already
    soft-deleted (so callers can short-circuit follow-up side effects like
    audit logging).

    Caller is responsible for the surrounding unit_of_work / commit.
    """
    current = getattr(instance, deleted_at_field, None)
    if current is not None:
        return False
    setattr(instance, deleted_at_field, datetime.now(timezone.utc))
    db.add(instance)
    await db.flush()
    return True
