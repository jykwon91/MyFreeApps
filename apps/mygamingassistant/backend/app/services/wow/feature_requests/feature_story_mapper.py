"""Convert feature-request ORM rows into the public / submitter / triage schemas.

Pure. Each builder names its fields explicitly — the public ones are an
allowlist, so a new private column can't leak by being picked up implicitly.
"""
from collections.abc import Sequence

from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_submission import WowFeatureSubmission
from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext
from app.schemas.wow.feature_requests.public_story import PublicStory
from app.schemas.wow.feature_requests.refined_story import RefinedStory
from app.schemas.wow.feature_requests.submitted_story import SubmittedStory
from app.schemas.wow.feature_requests.triage_inbox_item import TriageInboxItem
from app.schemas.wow.feature_requests.triage_story import TriageStory
from app.schemas.wow.feature_requests.triage_submission_note import TriageSubmissionNote


def _refined_fields(story: WowFeatureStory) -> dict[str, object]:
    return {
        "title": story.title,
        "persona": story.persona,
        "i_want": story.i_want,
        "so_that": story.so_that,
        "acceptance_criteria": list(story.acceptance_criteria),
        "follow_ups": list(story.follow_ups),
        "area": story.area,
        "topic": story.topic,
        "feasibility": story.feasibility,
        "feasibility_note": story.feasibility_note,
    }


def story_values(refined: RefinedStory) -> dict[str, object]:
    """Column values for a new story from a refined story."""
    return refined.model_dump()


def to_public_story(story: WowFeatureStory) -> PublicStory:
    return PublicStory(
        **_refined_fields(story),
        id=story.id,
        status=story.status,
        operator_note=story.operator_note,
        shipped_path=story.shipped_path,
        vote_count=story.vote_count,
        created_at=story.created_at,
    )


def to_submitted_story(story: WowFeatureStory) -> SubmittedStory:
    return SubmittedStory(**_refined_fields(story), id=story.id)


def to_submission_note(submission: WowFeatureSubmission) -> TriageSubmissionNote:
    return TriageSubmissionNote(
        submission_id=submission.id,
        verdict=submission.verdict,
        nuance_note=submission.nuance_note,
        created_at=submission.created_at,
    )


def to_triage_story(story: WowFeatureStory, submissions: Sequence[WowFeatureSubmission]) -> TriageStory:
    return TriageStory(
        **_refined_fields(story),
        id=story.id,
        status=story.status,
        priority=story.priority,
        operator_note=story.operator_note,
        shipped_path=story.shipped_path,
        shipped_at=story.shipped_at,
        merged_into_id=story.merged_into_id,
        vote_count=story.vote_count,
        hidden=story.hidden_at is not None,
        created_at=story.created_at,
        updated_at=story.updated_at,
        submissions=[to_submission_note(s) for s in submissions],
    )


def submission_context(submission: WowFeatureSubmission) -> FeatureRequestContext:
    return FeatureRequestContext(
        class_id=submission.class_id,
        experience=submission.experience,
        level_band=submission.level_band,
        professions=list(submission.professions),
        activities=list(submission.activities),
        faction=submission.faction,
    )


def context_values(context: FeatureRequestContext | None) -> dict[str, object]:
    """Column values for a submission's "About you" context."""
    if context is None:
        return {"professions": [], "activities": []}
    return context.model_dump()


def to_inbox_item(submission: WowFeatureSubmission, story: TriageStory | None) -> TriageInboxItem:
    return TriageInboxItem(
        submission_id=submission.id,
        verdict=submission.verdict,
        untrusted_submission_text=submission.raw_text,
        untrusted_clarification_answer=submission.clarification_answer,
        context=submission_context(submission),
        claude_reason=submission.reason,
        nuance_note=submission.nuance_note,
        parent_submission_id=submission.parent_submission_id,
        model_id=submission.model_id,
        story=story,
        created_at=submission.created_at,
    )
