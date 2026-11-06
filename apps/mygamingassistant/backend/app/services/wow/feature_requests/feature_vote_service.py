"""Cast and take back "me too" votes — the ONE vote path.

Used by the vote endpoints and by a ``duplicate`` submission (the submitter's
"me too"), so both share the same rules:

- The story row is locked (FOR UPDATE) for the whole vote, so the
  per-network count, the insert/delete and ``vote_count`` stay consistent.
- A story merged into another forwards to its target (one hop — merges keep
  ``merged_into_id`` flat).
- Only public, non-hidden stories exist here; only active ones take new votes.
- One vote per browser (``voter_key``) per story; a repeat is a no-op.
- At most ``MAX_VOTES_PER_IP_PER_STORY`` votes per network per story.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_feature_request_enums import (
    ACTIVE_STORY_STATUSES,
    PUBLIC_STORY_STATUSES,
    STATUS_DUPLICATE,
    VOTE_SOURCE_VOTE,
)
from app.core.wow_feature_request_limits import MAX_VOTES_PER_IP_PER_STORY
from app.db.session import unit_of_work
from app.models.wow.feature_story import WowFeatureStory
from app.repositories.wow import feature_story_repo, feature_vote_repo
from app.schemas.wow.feature_requests.vote_response import VoteResponse
from app.services.wow.feature_requests.feature_hashing import vote_ip_hash, voter_key
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureRequestNotFoundError,
    StoryNotVotableError,
    VoteLimitError,
)


async def lock_public_target(db: AsyncSession, story_id: uuid.UUID) -> WowFeatureStory | None:
    """The public story to act on, locked: itself, or its merge target."""
    story = await feature_story_repo.get_for_update(db, story_id)
    if story is None or story.hidden_at is not None:
        return None
    if story.status == STATUS_DUPLICATE:
        if story.merged_into_id is None:
            return None
        return await feature_story_repo.get_public_for_update(db, story.merged_into_id)
    return story if story.status in PUBLIC_STORY_STATUSES else None


async def cast_vote_in(
    db: AsyncSession, *, story: WowFeatureStory, client_id: uuid.UUID, ip: str, source: str
) -> bool:
    """Vote on an already-locked public ``story``. True if the browser now has a vote."""
    if story.status not in ACTIVE_STORY_STATUSES:
        raise StoryNotVotableError("Votes are closed on this story", error_type="not_votable")
    key = voter_key(client_id)
    if await feature_vote_repo.exists(db, story_id=story.id, voter_key=key):
        return True
    ip_hash = vote_ip_hash(story.id, ip)
    if await feature_vote_repo.count_for_network(db, story_id=story.id, ip_hash=ip_hash) >= MAX_VOTES_PER_IP_PER_STORY:
        raise VoteLimitError("This network already voted the most times allowed", error_type="vote_limit")
    if await feature_vote_repo.insert_if_absent(
        db, story_id=story.id, voter_key=key, ip_hash=ip_hash, source=source
    ):
        story.vote_count += 1
    return True


async def cast_vote(*, story_id: uuid.UUID, client_id: uuid.UUID, ip: str) -> VoteResponse:
    async with unit_of_work() as db:
        story = await lock_public_target(db, story_id)
        if story is None:
            raise FeatureRequestNotFoundError("No such public story", error_type="not_found")
        voted = await cast_vote_in(db, story=story, client_id=client_id, ip=ip, source=VOTE_SOURCE_VOTE)
        await feature_story_repo.flush(db)
        return VoteResponse(story_id=story.id, voted=voted, vote_count=story.vote_count)


async def remove_vote(*, story_id: uuid.UUID, client_id: uuid.UUID) -> VoteResponse:
    """Take a vote back (allowed on any public story, even a closed one)."""
    async with unit_of_work() as db:
        story = await lock_public_target(db, story_id)
        if story is None:
            raise FeatureRequestNotFoundError("No such public story", error_type="not_found")
        if await feature_vote_repo.delete_vote(db, story_id=story.id, voter_key=voter_key(client_id)):
            story.vote_count = max(0, story.vote_count - 1)
        await feature_story_repo.flush(db)
        return VoteResponse(story_id=story.id, voted=False, vote_count=story.vote_count)
