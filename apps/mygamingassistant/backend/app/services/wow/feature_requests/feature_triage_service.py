"""Triage: read the inbox and stories, edit, merge, mark submissions triaged.

Called only by the signed-in operator (superuser; ``app/api/wow_feature_triage.py``).
Every write logs ONE structured INFO line — actor (the operator's user id),
action, ids, status before -> after; never story text, never an email.
``audit_logs`` records the row changes with ``changed_by`` = the operator's user
id (set from the JWT by the audit middleware).

Optimistic concurrency: PATCH and merge take the story's ``updated_at`` (sent
as ``If-Match``); a stale value raises ``StoryChangedError``.
"""
import logging
import uuid
from collections.abc import Collection
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_feature_request_enums import STATUS_DUPLICATE, STATUS_SHIPPED
from app.core.wow_feature_request_limits import (
    CRITERION_MAX,
    FOLLOW_UP_MAX,
    FEASIBILITY_NOTE_MAX,
    I_WANT_MAX,
    OPERATOR_NOTE_MAX,
    PERSONA_MAX,
    SO_THAT_MAX,
    TITLE_MAX,
    TOPIC_MAX,
    TRIAGE_INBOX_MAX,
)
from app.db.session import unit_of_work
from app.models.wow.feature_story import WowFeatureStory
from app.repositories.wow import feature_story_repo, feature_submission_repo, feature_vote_repo
from app.schemas.wow.feature_requests.triage_inbox import TriageInbox
from app.schemas.wow.feature_requests.triage_mark_triaged_result import TriageMarkTriagedResult
from app.schemas.wow.feature_requests.triage_merge_result import TriageMergeResult
from app.schemas.wow.feature_requests.triage_story import TriageStory
from app.schemas.wow.feature_requests.triage_story_list import TriageStoryList
from app.schemas.wow.feature_requests.triage_story_patch import TriageStoryPatch
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureRequestInputError,
    FeatureRequestNotFoundError,
    StoryChangedError,
    TriageConflictError,
)
from app.services.wow.feature_requests.feature_story_mapper import to_inbox_item, to_triage_story
from app.services.wow.feature_requests.feature_text import clean_field, has_forbidden_markup

logger = logging.getLogger(__name__)

_LOG_PREFIX = "wow feature triage"

# Free-text fields triage may edit, with their caps. Same output filter as
# Claude's text: the board is public.
_TEXT_FIELDS: dict[str, int] = {
    "title": TITLE_MAX,
    "persona": PERSONA_MAX,
    "i_want": I_WANT_MAX,
    "so_that": SO_THAT_MAX,
    "topic": TOPIC_MAX,
    "feasibility_note": FEASIBILITY_NOTE_MAX,
    "operator_note": OPERATOR_NOTE_MAX,
}
_LIST_FIELDS: dict[str, int] = {"acceptance_criteria": CRITERION_MAX, "follow_ups": FOLLOW_UP_MAX}
# Applied as given (already enum/range/pattern-checked by the schema).
_PLAIN_FIELDS: tuple[str, ...] = ("area", "feasibility", "priority", "shipped_path")


def _filtered_text(name: str, value: str, max_len: int) -> str:
    if has_forbidden_markup(value):
        raise FeatureRequestInputError(f"{name}: no links, HTML, markdown links or @names", error_type="markup")
    cleaned = clean_field(value, max_len)
    if cleaned is None:
        raise FeatureRequestInputError(f"{name} cannot be blank", error_type="blank")
    return cleaned


def _patch_values(patch: TriageStoryPatch, story: WowFeatureStory, now: datetime) -> dict[str, object]:
    values: dict[str, object] = {}
    for name in patch.model_fields_set:
        value = getattr(patch, name)
        if name in _TEXT_FIELDS:
            text = None if value is None else _filtered_text(name, value, _TEXT_FIELDS[name])
            values[name] = text.lower() if name == "topic" and text is not None else text
        elif name in _LIST_FIELDS:
            values[name] = [_filtered_text(name, item, _LIST_FIELDS[name]) for item in value]
        elif name in _PLAIN_FIELDS:
            values[name] = value
        elif name == "hidden":
            values["hidden_at"] = (story.hidden_at or now) if value else None
        elif name == "status":
            values["status"] = value
            values["shipped_at"] = (story.shipped_at or now) if value == STATUS_SHIPPED else None
    return values


def _check_version(story: WowFeatureStory, if_match: datetime) -> None:
    if story.updated_at != if_match:
        raise StoryChangedError("The story changed since it was read", error_type="stale_if_match")


async def _triage_stories(db: AsyncSession, stories: Collection[WowFeatureStory]) -> list[TriageStory]:
    submissions = await feature_submission_repo.list_for_stories(db, [s.id for s in stories])
    return [to_triage_story(s, submissions.get(s.id, [])) for s in stories]


async def get_inbox() -> TriageInbox:
    """Untriaged submissions oldest first — rejected / needs_clarification included."""
    async with unit_of_work() as db:
        submissions = await feature_submission_repo.list_untriaged(db, limit=TRIAGE_INBOX_MAX)
        total = await feature_submission_repo.count_untriaged(db)
        stories = await feature_story_repo.by_ids(db, {s.story_id for s in submissions if s.story_id is not None})
        triage_stories = {story.id: story for story in await _triage_stories(db, list(stories.values()))}
    return TriageInbox(
        items=[to_inbox_item(s, triage_stories.get(s.story_id) if s.story_id else None) for s in submissions],
        total_untriaged=total,
    )


async def list_stories(*, statuses: Collection[str] | None) -> TriageStoryList:
    async with unit_of_work() as db:
        stories = await feature_story_repo.list_for_triage(db, statuses=statuses)
        return TriageStoryList(items=await _triage_stories(db, stories))


async def patch_story(
    story_id: uuid.UUID, patch: TriageStoryPatch, *, if_match: datetime, actor: str
) -> TriageStory:
    now = datetime.now(timezone.utc)
    async with unit_of_work() as db:
        story = await feature_story_repo.get_for_update(db, story_id)
        if story is None:
            raise FeatureRequestNotFoundError("No such story", error_type="not_found")
        _check_version(story, if_match)
        if story.status == STATUS_DUPLICATE:
            raise TriageConflictError("A merged story can't be edited", error_type="merged")
        before = story.status
        feature_story_repo.apply(story, _patch_values(patch, story, now))
        await feature_story_repo.flush(db)
        logger.info(
            "%s: actor=%s action=patch story=%s status=%s->%s fields=%s",
            _LOG_PREFIX,
            actor,
            story.id,
            before,
            story.status,
            ",".join(sorted(patch.model_fields_set)),
        )
        return (await _triage_stories(db, [story]))[0]


async def merge_story(
    source_id: uuid.UUID, into_id: uuid.UUID, *, if_match: datetime, actor: str
) -> TriageMergeResult:
    """Merge ``source`` into ``into``: votes move (a voter on both keeps one),
    stories merged into ``source`` re-point to ``into``, submissions follow,
    the target's count is recomputed, ``source`` becomes ``duplicate``."""
    if source_id == into_id:
        raise TriageConflictError("A story can't be merged into itself", error_type="self_merge")
    async with unit_of_work() as db:
        locked = await feature_story_repo.lock_many(db, [source_id, into_id])
        source, target = locked.get(source_id), locked.get(into_id)
        if source is None or target is None:
            raise FeatureRequestNotFoundError("No such story", error_type="not_found")
        _check_version(source, if_match)
        if source.status == STATUS_DUPLICATE:
            raise TriageConflictError("The story is already merged", error_type="already_merged")
        if target.status == STATUS_DUPLICATE:
            raise TriageConflictError("The target story is itself merged", error_type="target_merged")
        before = source.status

        await feature_vote_repo.move_votes(db, from_id=source.id, to_id=target.id)
        await feature_story_repo.repoint_merged_children(db, from_id=source.id, to_id=target.id)
        await feature_submission_repo.repoint_story(db, from_id=source.id, to_id=target.id)
        feature_story_repo.apply(source, {"status": STATUS_DUPLICATE, "merged_into_id": target.id, "vote_count": 0})
        await feature_story_repo.flush(db)
        target.vote_count = await feature_story_repo.count_votes(db, target.id)
        await feature_story_repo.flush(db)

        logger.info(
            "%s: actor=%s action=merge story=%s into=%s status=%s->%s target_votes=%d",
            _LOG_PREFIX,
            actor,
            source.id,
            target.id,
            before,
            source.status,
            target.vote_count,
        )
        source_out, target_out = await _triage_stories(db, [source, target])
        return TriageMergeResult(source=source_out, target=target_out)


async def mark_triaged(submission_ids: Collection[uuid.UUID], *, actor: str) -> TriageMarkTriagedResult:
    async with unit_of_work() as db:
        marked = await feature_submission_repo.mark_triaged(db, submission_ids, at=datetime.now(timezone.utc))
    logger.info(
        "%s: actor=%s action=mark_triaged requested=%d marked=%d", _LOG_PREFIX, actor, len(submission_ids), marked
    )
    return TriageMarkTriagedResult(marked=marked)
