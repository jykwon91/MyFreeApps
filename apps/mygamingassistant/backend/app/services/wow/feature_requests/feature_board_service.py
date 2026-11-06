"""The public board: list stories and look one up. Read-only.

Only public, non-hidden stories come back (enforced in ``feature_story_repo``).
A story merged into another answers a pointer to it, when that one is public.
"""
import uuid
from collections.abc import Collection

from app.core.wow_feature_request_enums import STATUS_DUPLICATE
from app.db.session import unit_of_work
from app.repositories.wow import feature_story_repo, feature_vote_repo
from app.schemas.wow.feature_requests.merged_story_pointer import MergedStoryPointer
from app.schemas.wow.feature_requests.public_story_list import PublicStoryList
from app.schemas.wow.feature_requests.public_story_lookup import PublicStoryLookup
from app.services.wow.feature_requests.feature_hashing import voter_key
from app.services.wow.feature_requests.feature_request_errors import FeatureRequestNotFoundError
from app.services.wow.feature_requests.feature_story_mapper import to_public_story


async def list_board(
    *,
    statuses: Collection[str],
    area: str | None,
    sort: str,
    limit: int,
    offset: int,
    client_id: uuid.UUID | None,
) -> PublicStoryList:
    async with unit_of_work() as db:
        stories, total = await feature_story_repo.list_public(
            db, statuses=statuses, area=area, sort=sort, limit=limit, offset=offset
        )
        voted: list[uuid.UUID] = []
        if client_id is not None:
            voted = await feature_vote_repo.voted_story_ids(
                db, voter_key=voter_key(client_id), story_ids=[s.id for s in stories]
            )
    next_offset = offset + len(stories) if offset + len(stories) < total else None
    return PublicStoryList(
        items=[to_public_story(s) for s in stories],
        next_offset=next_offset,
        total=total,
        voted_story_ids=voted,
    )


async def get_story(story_id: uuid.UUID) -> PublicStoryLookup:
    async with unit_of_work() as db:
        story = await feature_story_repo.get_public(db, story_id)
        if story is not None:
            return to_public_story(story)
        merged = await feature_story_repo.get(db, story_id)
        if (
            merged is not None
            and merged.status == STATUS_DUPLICATE
            and merged.hidden_at is None
            and merged.merged_into_id is not None
            and await feature_story_repo.get_public(db, merged.merged_into_id) is not None
        ):
            return MergedStoryPointer(merged_into_id=merged.merged_into_id)
    raise FeatureRequestNotFoundError("No such public story", error_type="not_found")
