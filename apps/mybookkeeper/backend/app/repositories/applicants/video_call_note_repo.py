"""Repository for ``video_call_notes``.

Tenant scoping: rows have no ``organization_id`` or ``user_id`` of their
own — they're scoped through their parent ``Applicant``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.video_call_note import VideoCallNote

# Allowlist of fields updatable via ``update``. Excludes tenant-scoping
# ``applicant_id`` and server-managed ``created_at`` / ``key_version``.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "scheduled_at",
    "completed_at",
    "notes",
    "gut_rating",
    "transcript_storage_key",
})


async def create(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    scheduled_at: _dt.datetime,
    completed_at: _dt.datetime | None = None,
    notes: str | None = None,
    gut_rating: int | None = None,
    transcript_storage_key: str | None = None,
) -> VideoCallNote:
    """Create a video_call_note row. ``notes`` is plaintext — encryption is automatic.

    Caller is responsible for proving the applicant belongs to the calling
    tenant via ``applicant_repo.get()`` BEFORE calling this.
    """
    note = VideoCallNote(
        applicant_id=applicant_id,
        scheduled_at=scheduled_at,
        completed_at=completed_at,
        notes=notes,
        gut_rating=gut_rating,
        transcript_storage_key=transcript_storage_key,
    )
    db.add(note)
    await db.flush()
    return note


async def list_for_applicant(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[VideoCallNote]:
    """List video call notes for an applicant, newest scheduled call first."""
    result = await db.execute(
        select(VideoCallNote)
        .join(Applicant, Applicant.id == VideoCallNote.applicant_id)
        .where(
            VideoCallNote.applicant_id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
        .order_by(desc(VideoCallNote.scheduled_at))
    )
    return list(result.scalars().all())


async def update_note(
    db: AsyncSession,
    *,
    video_call_note_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    fields: dict[str, object],
) -> VideoCallNote | None:
    """Apply allowlisted updates to a video call note. Tenant-scoped through Applicant."""
    found = await db.execute(
        select(VideoCallNote)
        .join(Applicant, Applicant.id == VideoCallNote.applicant_id)
        .where(
            VideoCallNote.id == video_call_note_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
    )
    note = found.scalar_one_or_none()
    if note is None:
        return None

    safe = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe:
        return note

    await db.execute(
        update(VideoCallNote)
        .where(VideoCallNote.id == video_call_note_id)
        .values(**safe)
    )
    await db.flush()
    await db.refresh(note)
    return note
