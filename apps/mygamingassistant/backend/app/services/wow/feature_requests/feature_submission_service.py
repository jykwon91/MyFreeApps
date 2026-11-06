"""Submit one anonymous feature request: validate, guard, refine, store.

Order (after the route's availability / per-IP / Turnstile gates):

1. Validate and clean the text (or, for a follow-up, load the parent question).
2. Inbox guard: too many untriaged submissions -> ``FeatureInboxFullError``.
3. Fingerprint short-circuit: the same text within 30 days reuses its story
   (no Claude call, no quota).
4. One unit of the durable daily cap (its own short transaction).
5. Claude — with NO transaction held.
6. One write transaction: re-resolve a duplicate's target FOR UPDATE (one hop
   through a merge); if it's gone, keep the request as a new story instead.

A ``duplicate`` submitter's "me too" goes through ``feature_vote_service`` —
the same path and limits as the vote endpoint; a vote that can't count
(closed story, network cap) never fails the submission.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.daily_quota_repo import try_consume_daily_quota

from app.core.config import settings
from app.core.wow_feature_request_enums import (
    STATUS_SUBMITTED,
    VERDICT_DUPLICATE,
    VERDICT_NEEDS_CLARIFICATION,
    VERDICT_NEW,
    VERDICT_REJECTED,
    VOTE_SOURCE_SUBMISSION,
)
from app.core.wow_feature_request_limits import (
    CLARIFICATION_ANSWER_MAX,
    DAILY_CAP_BUCKET,
    DEDUPE_CANDIDATES_MAX,
    FINGERPRINT_REUSE_DAYS,
    MAX_UNTRIAGED_SUBMISSIONS,
    RAW_TEXT_MAX,
    RAW_TEXT_MIN,
)
from app.db.session import unit_of_work
from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_submission import WowFeatureSubmission
from app.repositories.wow import feature_story_repo, feature_submission_repo
from app.schemas.wow.feature_requests.feature_submit_request import FeatureSubmitRequest
from app.schemas.wow.feature_requests.feature_submit_response import FeatureSubmitResponse
from app.schemas.wow.feature_requests.submit_clarification_response import SubmitClarificationResponse
from app.schemas.wow.feature_requests.submit_duplicate_response import SubmitDuplicateResponse
from app.schemas.wow.feature_requests.submit_new_response import SubmitNewResponse
from app.schemas.wow.feature_requests.submit_rejected_response import SubmitRejectedResponse
from app.services.wow.feature_requests.dedupe_candidate import DedupeCandidate
from app.services.wow.feature_requests.feature_hashing import submission_ip_hash
from app.services.wow.feature_requests.feature_refiner import refine_feature_request
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureClarificationAnsweredError,
    FeatureInboxFullError,
    FeatureRequestDailyCapError,
    FeatureRequestInputError,
    FeatureRequestNotConfiguredError,
    FeatureRequestNotFoundError,
    StoryNotVotableError,
    VoteLimitError,
)
from app.services.wow.feature_requests.feature_story_mapper import (
    context_values,
    story_values,
    submission_context,
    to_public_story,
    to_submitted_story,
)
from app.services.wow.feature_requests.feature_text import clean_raw_text
from app.services.wow.feature_requests.feature_vote_service import cast_vote_in, lock_public_target
from app.services.wow.feature_requests.prepared_submission import PreparedSubmission
from app.services.wow.feature_requests.refinement_result import RefinementResult

logger = logging.getLogger(__name__)

_LOG_PREFIX = "wow feature request"


def _clean_text(value: str | None) -> str:
    text = clean_raw_text(value or "")
    if not RAW_TEXT_MIN <= len(text) <= RAW_TEXT_MAX:
        raise FeatureRequestInputError(
            f"Describe the feature in {RAW_TEXT_MIN}-{RAW_TEXT_MAX} characters.", error_type="bad_length"
        )
    return text


def _clean_answer(value: str | None) -> str | None:
    """The cleaned answer, or None when the visitor skipped the question."""
    answer = clean_raw_text(value or "")
    if not answer:
        return None
    if len(answer) > CLARIFICATION_ANSWER_MAX:
        raise FeatureRequestInputError(
            f"Answer in at most {CLARIFICATION_ANSWER_MAX} characters.", error_type="bad_length"
        )
    return answer


def _check_parent(parent: WowFeatureSubmission | None) -> WowFeatureSubmission:
    if parent is None or parent.raw_text is None:
        raise FeatureRequestNotFoundError("No such question", error_type="parent_not_found")
    if parent.verdict != VERDICT_NEEDS_CLARIFICATION:
        raise FeatureClarificationAnsweredError("That request has no open question", error_type="not_a_question")
    return parent


async def _prepare(request: FeatureSubmitRequest) -> PreparedSubmission:
    if request.parent_submission_id is None:
        return PreparedSubmission(
            raw_text=_clean_text(request.text),
            clarification_answer=None,
            parent_id=None,
            context=request.context,
            client_id=request.client_id,
        )
    answer = _clean_answer(request.clarification_answer)
    async with unit_of_work() as db:
        parent = _check_parent(await feature_submission_repo.get(db, request.parent_submission_id))
        if await feature_submission_repo.has_follow_up(db, parent.id):
            raise FeatureClarificationAnsweredError("Already answered", error_type="already_answered")
        assert parent.raw_text is not None
        return PreparedSubmission(
            raw_text=parent.raw_text,
            clarification_answer=answer,
            parent_id=parent.id,
            context=request.context or submission_context(parent),
            client_id=request.client_id,
        )


async def _vote_as_submitter(db: AsyncSession, story: WowFeatureStory, prepared: PreparedSubmission, ip: str) -> bool:
    try:
        return await cast_vote_in(
            db, story=story, client_id=prepared.client_id, ip=ip, source=VOTE_SOURCE_SUBMISSION
        )
    except (StoryNotVotableError, VoteLimitError) as exc:
        logger.info("%s: me-too vote not counted (%s)", _LOG_PREFIX, exc.error_type)
        return False


async def _reuse_by_fingerprint(db: AsyncSession, prepared: PreparedSubmission, ip: str) -> FeatureSubmitResponse | None:
    since = datetime.now(timezone.utc) - timedelta(days=FINGERPRINT_REUSE_DAYS)
    earlier = await feature_submission_repo.find_story_linked_by_fingerprint(
        db, fingerprint=prepared.fingerprint, since=since
    )
    if earlier is None or earlier.story_id is None:
        return None
    public = await lock_public_target(db, earlier.story_id)
    if public is not None:
        voted = await _vote_as_submitter(db, public, prepared, ip)
        await feature_story_repo.flush(db)
        logger.info("%s: reused public story by fingerprint", _LOG_PREFIX)
        return SubmitDuplicateResponse(story=to_public_story(public), nuance_note=None, voted=voted)
    story = await feature_story_repo.get(db, earlier.story_id)
    if story is not None and story.status == STATUS_SUBMITTED and story.hidden_at is None:
        logger.info("%s: reused submitted story by fingerprint", _LOG_PREFIX)
        return SubmitNewResponse(submission_id=earlier.id, story=to_submitted_story(story))
    return None


async def _consume_daily_quota() -> None:
    cap = settings.wow_feature_request_daily_cap
    async with unit_of_work() as db:
        consumed = await try_consume_daily_quota(db, bucket=DAILY_CAP_BUCKET, cap=cap)
    if not consumed:
        logger.warning("%s: daily cap reached (cap=%d)", _LOG_PREFIX, cap)
        raise FeatureRequestDailyCapError("Daily feature-request cap reached", error_type="daily_cap_reached")


def _submission_values(prepared: PreparedSubmission, result: RefinementResult, ip: str) -> dict[str, object]:
    return {
        "raw_text": prepared.raw_text,
        "clarification_answer": prepared.clarification_answer,
        "parent_submission_id": prepared.parent_id,
        **context_values(prepared.context),
        "text_fingerprint": prepared.fingerprint,
        "model_id": result.model_id,
        "ip_hash": submission_ip_hash(ip),
    }


async def _lock_parent_for_follow_up(db: AsyncSession, parent_id: uuid.UUID) -> None:
    """Re-check under lock (a parent is followed up once) and dismiss it from the inbox."""
    parent = _check_parent(await feature_submission_repo.get_for_update(db, parent_id))
    if await feature_submission_repo.has_follow_up(db, parent.id):
        raise FeatureClarificationAnsweredError("Already answered", error_type="already_answered")
    if parent.triaged_at is None:
        parent.triaged_at = datetime.now(timezone.utc)


async def _write(prepared: PreparedSubmission, result: RefinementResult, ip: str) -> FeatureSubmitResponse:
    async with unit_of_work() as db:
        if prepared.parent_id is not None:
            await _lock_parent_for_follow_up(db, prepared.parent_id)
        values = _submission_values(prepared, result, ip)

        if result.verdict == VERDICT_DUPLICATE and result.duplicate_of is not None:
            target = await lock_public_target(db, result.duplicate_of)
            if target is not None:
                feature_submission_repo.add(
                    db, {**values, "verdict": VERDICT_DUPLICATE, "story_id": target.id, "nuance_note": result.nuance_note}
                )
                voted = await _vote_as_submitter(db, target, prepared, ip)
                await feature_story_repo.flush(db)
                return SubmitDuplicateResponse(
                    story=to_public_story(target), nuance_note=result.nuance_note, voted=voted
                )
            logger.warning("%s: duplicate target no longer public; stored as new", _LOG_PREFIX)

        if result.verdict in (VERDICT_NEW, VERDICT_DUPLICATE):
            assert result.story is not None
            story = feature_story_repo.add(db, {**story_values(result.story), "status": STATUS_SUBMITTED})
            await feature_story_repo.flush(db)
            submission = feature_submission_repo.add(db, {**values, "verdict": VERDICT_NEW, "story_id": story.id})
            await feature_submission_repo.flush(db)
            return SubmitNewResponse(submission_id=submission.id, story=to_submitted_story(story))

        submission = feature_submission_repo.add(db, {**values, "verdict": result.verdict, "reason": result.reason})
        await feature_submission_repo.flush(db)
        if result.verdict == VERDICT_NEEDS_CLARIFICATION:
            assert result.reason is not None
            return SubmitClarificationResponse(submission_id=submission.id, question=result.reason)
        assert result.verdict == VERDICT_REJECTED
        return SubmitRejectedResponse()


async def submit_feature_request(request: FeatureSubmitRequest, *, ip: str) -> FeatureSubmitResponse:
    """Raises a ``FeatureRequestError`` subclass on failure."""
    if not settings.anthropic_api_key:
        raise FeatureRequestNotConfiguredError("ANTHROPIC_API_KEY is not set", error_type="missing_api_key")
    prepared = await _prepare(request)

    async with unit_of_work() as db:
        if await feature_submission_repo.count_untriaged(db) >= MAX_UNTRIAGED_SUBMISSIONS:
            logger.warning("%s: inbox full (max=%d)", _LOG_PREFIX, MAX_UNTRIAGED_SUBMISSIONS)
            raise FeatureInboxFullError("Too many requests awaiting review", error_type="inbox_full")
        reused = await _reuse_by_fingerprint(db, prepared, ip)
        if reused is not None:
            return reused
        rows = await feature_story_repo.list_dedupe_candidates(db, limit=DEDUPE_CANDIDATES_MAX)
        candidates = [DedupeCandidate(id=r.id, title=r.title, i_want=r.i_want, area=r.area) for r in rows]

    await _consume_daily_quota()
    result = await refine_feature_request(
        raw_text=prepared.raw_text,
        clarification_answer=prepared.clarification_answer,
        is_follow_up=prepared.is_follow_up,
        context=prepared.context,
        candidates=candidates,
    )
    logger.info("%s: refined verdict=%s", _LOG_PREFIX, result.verdict)
    return await _write(prepared, result, ip)
