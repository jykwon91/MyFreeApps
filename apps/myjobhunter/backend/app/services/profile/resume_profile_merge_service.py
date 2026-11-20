"""Merge parsed resume rows into a user's profile without duplicating them.

Every resume upload re-parses the whole document, so a second upload
carries every role and degree the profile already holds. Each parsed row
is matched against the user's existing rows (and the rows already added
from this same parse) on a normalized key — see ``resume_row_merge``.
A match fills only the existing row's empty fields; a miss is inserted.

Why service-level dedup and not a unique index: production profiles
already hold duplicates from earlier uploads, so a unique index on the
normalized key would fail to build without a migration that deletes
user rows — and choosing which duplicate to keep (each may carry user
edits) is a destructive decision a migration cannot make safely.

The caller owns the transaction: this function adds and mutates rows
in ``db`` but does not commit.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable, Hashable, Sequence
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.education import Education
from app.models.profile.work_history import WorkHistory
from app.repositories.profile import education_repository, work_history_repository
from app.schemas.profile.resume_merge_result import ResumeMergeResult
from app.services.profile.resume_row_merge import (
    education_key,
    fill_empty_education_fields,
    fill_empty_work_history_fields,
    work_history_key,
)

_Row = TypeVar("_Row", WorkHistory, Education)


def _split_new_and_matched(
    existing: Sequence[_Row],
    parsed: Sequence[_Row],
    key: Callable[[_Row], Hashable],
    fill_empty: Callable[[_Row, _Row], bool],
) -> tuple[list[_Row], int]:
    """Return (rows to insert, number of parsed rows that matched a known row).

    The index starts with the existing rows (first one wins when the
    profile already holds duplicates) and grows with each new row, so
    duplicates inside a single parse collapse into one insert.
    """
    index: dict[Hashable, _Row] = {}
    for row in existing:
        index.setdefault(key(row), row)

    to_insert: list[_Row] = []
    matched = 0
    for row in parsed:
        row_key = key(row)
        known = index.get(row_key)
        if known is None:
            index[row_key] = row
            to_insert.append(row)
        else:
            fill_empty(known, row)
            matched += 1
    return to_insert, matched


async def merge_parsed_profile_rows(
    db: AsyncSession,
    user_id: uuid.UUID,
    work_entries: Sequence[WorkHistory],
    education_entries: Sequence[Education],
) -> ResumeMergeResult:
    """Insert parsed rows the profile lacks; fill empty fields on the ones it has."""
    new_work, work_matched = _split_new_and_matched(
        await work_history_repository.list_by_user(db, user_id),
        work_entries,
        work_history_key,
        fill_empty_work_history_fields,
    )
    new_education, education_matched = _split_new_and_matched(
        await education_repository.list_by_user(db, user_id),
        education_entries,
        education_key,
        fill_empty_education_fields,
    )

    await work_history_repository.add_all(db, new_work)
    await education_repository.add_all(db, new_education)

    return ResumeMergeResult(
        work_history_added=len(new_work),
        work_history_matched=work_matched,
        education_added=len(new_education),
        education_matched=education_matched,
    )
