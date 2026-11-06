"""Feature-request repositories and the retention purge, on the real test DB."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.feature_submission import WowFeatureSubmission
from app.models.wow.feature_vote import WowFeatureVote
from app.repositories.wow import feature_story_repo, feature_submission_repo, feature_vote_repo
from app.services.wow.feature_requests.feature_retention_service import purge_feature_request_data
from app.services.wow.feature_requests.feature_text import text_fingerprint
from app.services.wow.feature_requests.purge_result import PurgeResult

from wow_feature_helpers import make_story, make_submission

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
VOTER_A, VOTER_B = "a" * 64, "b" * 64
NET_1, NET_2 = "1" * 64, "2" * 64


async def test_public_listing_never_returns_private_rows(db: AsyncSession) -> None:
    public = await make_story(db, title="Public")
    await make_story(db, title="Submitted", status="submitted")
    await make_story(db, title="Hidden", hidden_at=NOW)
    await make_story(db, title="Merged", status="duplicate", merged_into_id=public.id)
    # Even if a caller asks for private statuses, they're filtered out.
    rows, total = await feature_story_repo.list_public(
        db, statuses=("open", "submitted", "duplicate"), area=None, sort="top", limit=50, offset=0
    )
    assert [row.title for row in rows] == ["Public"] and total == 1
    candidates = await feature_story_repo.list_dedupe_candidates(db, limit=200)
    assert [row.title for row in candidates] == ["Public"]


async def test_dedupe_candidates_are_capped_and_most_voted_first(db: AsyncSession) -> None:
    for votes in (1, 5, 3):
        await make_story(db, title=f"Votes {votes}", vote_count=votes)
    rows = await feature_story_repo.list_dedupe_candidates(db, limit=2)
    assert [row.title for row in rows] == ["Votes 5", "Votes 3"]


async def test_fingerprint_lookup(db: AsyncSession) -> None:
    story = await make_story(db, status="submitted")
    text = "Please add an alchemy route"
    await make_submission(db, raw_text=text, verdict="rejected")
    assert await feature_submission_repo.find_story_linked_by_fingerprint(
        db, fingerprint=text_fingerprint(text), since=NOW - timedelta(days=365)
    ) is None
    linked = await make_submission(db, raw_text=text, verdict="new", story_id=story.id)
    found = await feature_submission_repo.find_story_linked_by_fingerprint(
        db, fingerprint=text_fingerprint("please  ADD an alchemy route"), since=NOW - timedelta(days=365)
    )
    assert found is not None and found.id == linked.id
    later = datetime.now(timezone.utc) + timedelta(minutes=1)
    assert await feature_submission_repo.find_story_linked_by_fingerprint(
        db, fingerprint=text_fingerprint(text), since=later
    ) is None


async def test_vote_insert_is_idempotent_and_counts_per_network(db: AsyncSession) -> None:
    story = await make_story(db)
    assert await feature_vote_repo.insert_if_absent(db, story_id=story.id, voter_key=VOTER_A, ip_hash=NET_1, source="vote")
    assert not await feature_vote_repo.insert_if_absent(
        db, story_id=story.id, voter_key=VOTER_A, ip_hash=NET_2, source="vote"
    )
    await feature_vote_repo.insert_if_absent(db, story_id=story.id, voter_key=VOTER_B, ip_hash=NET_1, source="submission")
    assert await feature_vote_repo.count_for_network(db, story_id=story.id, ip_hash=NET_1) == 2
    assert await feature_vote_repo.count_for_network(db, story_id=story.id, ip_hash=NET_2) == 0
    assert await feature_story_repo.count_votes(db, story.id) == 2
    assert await feature_vote_repo.delete_vote(db, story_id=story.id, voter_key=VOTER_A)
    assert not await feature_vote_repo.delete_vote(db, story_id=story.id, voter_key=VOTER_A)


async def test_move_votes_keeps_one_per_voter(db: AsyncSession) -> None:
    source, target = await make_story(db), await make_story(db, title="Target")
    for story, voter in ((source, VOTER_A), (source, VOTER_B), (target, VOTER_B)):
        await feature_vote_repo.insert_if_absent(db, story_id=story.id, voter_key=voter, ip_hash=NET_1, source="vote")
    await feature_vote_repo.move_votes(db, from_id=source.id, to_id=target.id)
    rows = (await db.scalars(select(WowFeatureVote).where(WowFeatureVote.story_id.in_([source.id, target.id])))).all()
    assert sorted((row.story_id == target.id, row.voter_key) for row in rows) == [(True, VOTER_A), (True, VOTER_B)]


async def test_mark_triaged_only_touches_untriaged(db: AsyncSession) -> None:
    fresh = await make_submission(db)
    done = await make_submission(db, raw_text="another request text", triaged_at=NOW)
    assert await feature_submission_repo.mark_triaged(db, [fresh.id, done.id], at=NOW + timedelta(hours=1)) == 1
    await db.refresh(done)
    assert done.triaged_at == NOW


# --- Retention --------------------------------------------------------------------


@pytest.mark.usefixtures("bound_unit_of_work")
async def test_retention_purge(db: AsyncSession) -> None:
    story = await make_story(db, status="submitted")
    old, recent = NOW - timedelta(days=200), NOW - timedelta(days=5)

    old_rejected = await make_submission(db, verdict="rejected", created_at=NOW - timedelta(days=15))
    old_question = await make_submission(db, verdict="needs_clarification", created_at=NOW - timedelta(days=15))
    follow_up = await make_submission(
        db, verdict="new", story_id=story.id, parent_submission_id=old_question.id, created_at=old, triaged_at=old
    )
    young_rejected = await make_submission(db, verdict="rejected", created_at=recent, ip_hash=NET_1)
    recent_linked = await make_submission(
        db, verdict="new", story_id=story.id, created_at=recent, triaged_at=recent, ip_hash=NET_2
    )
    untriaged_linked = await make_submission(db, verdict="new", story_id=story.id, created_at=old, ip_hash=NET_1)
    old_vote = WowFeatureVote(story_id=story.id, voter_key=VOTER_A, ip_hash=NET_1, source="vote", created_at=old)
    new_vote = WowFeatureVote(story_id=story.id, voter_key=VOTER_B, ip_hash=NET_2, source="vote", created_at=recent)
    db.add_all([old_vote, new_vote])
    await db.flush()

    result = await purge_feature_request_data(now=NOW)

    assert result.deleted_submissions == 2
    assert result.cleared_texts == 1
    assert result.cleared_submission_ip_hashes == 1
    assert result.cleared_vote_ip_hashes == 1
    remaining = set((await db.scalars(select(WowFeatureSubmission.id))).all())
    assert old_rejected.id not in remaining and old_question.id not in remaining
    for row in (follow_up, young_rejected, recent_linked, untriaged_linked, old_vote, new_vote):
        await db.refresh(row)
    assert follow_up.raw_text is None and follow_up.parent_submission_id is None
    assert recent_linked.raw_text is not None and recent_linked.ip_hash == NET_2
    assert untriaged_linked.raw_text is not None and untriaged_linked.ip_hash is None
    assert young_rejected.ip_hash == NET_1
    assert old_vote.ip_hash is None and new_vote.ip_hash == NET_2


@pytest.mark.usefixtures("bound_unit_of_work")
async def test_retention_purge_is_idempotent(db: AsyncSession) -> None:
    await make_submission(db, verdict="rejected", created_at=NOW - timedelta(days=30))
    first = await purge_feature_request_data(now=NOW)
    second = await purge_feature_request_data(now=NOW)
    assert first.deleted_submissions == 1
    assert second == PurgeResult(0, 0, 0, 0)
