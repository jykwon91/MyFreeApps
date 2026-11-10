"""Which stored files belong to the account a deletion removes."""
import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.document import Document
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.profile import Profile


def _queries(user_id: uuid.UUID) -> list[Select[tuple[str | None]]]:
    return [
        select(Document.file_path).where(Document.user_id == user_id),
        select(Profile.resume_file_path).where(Profile.user_id == user_id),
        select(ResumeUploadJob.file_path).where(ResumeUploadJob.user_id == user_id),
    ]


async def list_storage_keys(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Every stored file this user owns, soft-deleted documents included."""
    keys: set[str] = set()
    for query in _queries(user_id):
        keys.update(key for key in (await db.scalars(query)).all() if key)
    return sorted(keys)
