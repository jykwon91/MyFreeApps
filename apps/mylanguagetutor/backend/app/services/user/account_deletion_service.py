"""What MyLanguageTutor has to do around deleting a user's row."""
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User
from app.services.tutor.quota_service import user_bucket
from platform_shared.repositories.daily_quota_repo import delete_daily_usage_for_bucket


async def prepare_deletion(db: AsyncSession, user: User) -> Callable[[], None] | None:
    """Remove this user's daily quota counters inside the deletion transaction.

    Tutor rows cascade from ``users``, but the counters are keyed by the string
    ``ltutor:user:{id}``, which no foreign key reaches. Nothing to do after the
    commit, so there is no follow-up work to return.
    """
    await delete_daily_usage_for_bucket(db, bucket=user_bucket(user.id))
    return None
