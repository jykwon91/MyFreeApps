"""WoW Forever feature-request TRIAGE API — token-gated, mounted only when
WOW_FEATURE_TRIAGE_TOKEN is set (in BOTH modes; the one write surface in
serve-only prod, used by the operator's triage CLI).

Routes (all under /api/wow/feature-requests/triage):
    GET   /inbox                         — untriaged submissions (+ total)
    GET   /stories?status=               — every story incl. private fields
    PATCH /stories/{id}                  — allowlisted edits; If-Match required
    POST  /stories/{id}/merge            — merge into another; If-Match required
    POST  /submissions/mark-triaged      — clear submissions from the inbox

Authentication, rate limits and ``Cache-Control: no-store`` are applied by the
triage gate middleware (``app/core/triage_gate.py``) BEFORE FastAPI reads the
body; ``require_triage_actor`` is the defence-in-depth check that it ran.
No delete endpoint.
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status

from app.core.if_match import parse_if_match
from app.core.wow_feature_request_limits import (
    DETAIL_IF_MATCH_INVALID,
    DETAIL_IF_MATCH_REQUIRED,
    DETAIL_MERGE_CONFLICT,
    DETAIL_NOT_FOUND,
    DETAIL_STATUS_CONFLICT,
    DETAIL_STORY_CHANGED,
    NOT_FOUND_DETAIL,
    TRIAGE_PATH_PREFIX,
)
from app.schemas.wow.feature_requests.feature_literals import StoryStatus
from app.schemas.wow.feature_requests.triage_inbox import TriageInbox
from app.schemas.wow.feature_requests.triage_mark_triaged_request import TriageMarkTriagedRequest
from app.schemas.wow.feature_requests.triage_mark_triaged_result import TriageMarkTriagedResult
from app.schemas.wow.feature_requests.triage_merge_request import TriageMergeRequest
from app.schemas.wow.feature_requests.triage_merge_result import TriageMergeResult
from app.schemas.wow.feature_requests.triage_story import TriageStory
from app.schemas.wow.feature_requests.triage_story_list import TriageStoryList
from app.schemas.wow.feature_requests.triage_story_patch import TriageStoryPatch
from app.services.wow.feature_requests import feature_triage_service
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureRequestError,
    FeatureRequestInputError,
    FeatureRequestNotFoundError,
    StoryChangedError,
    TriageConflictError,
)

logger = logging.getLogger(__name__)


async def require_triage_actor(request: Request) -> str:
    actor = getattr(request.state, "triage_actor", None)
    if not isinstance(actor, str):
        # The gate didn't run (or didn't authenticate): look like an unknown route.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)
    return actor


def _required_if_match(if_match: str | None) -> datetime:
    try:
        parsed = parse_if_match(if_match)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=DETAIL_IF_MATCH_INVALID) from exc
    if parsed is None:
        raise HTTPException(status.HTTP_428_PRECONDITION_REQUIRED, detail=DETAIL_IF_MATCH_REQUIRED)
    return parsed


def _http_error(exc: FeatureRequestError, *, conflict_detail: str) -> HTTPException:
    if isinstance(exc, FeatureRequestNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=DETAIL_NOT_FOUND)
    if isinstance(exc, StoryChangedError):
        return HTTPException(status.HTTP_412_PRECONDITION_FAILED, detail=DETAIL_STORY_CHANGED)
    if isinstance(exc, TriageConflictError):
        return HTTPException(status.HTTP_409_CONFLICT, detail=conflict_detail)
    if isinstance(exc, FeatureRequestInputError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="triage_failed")


def build_triage_router() -> APIRouter:
    router = APIRouter(prefix=TRIAGE_PATH_PREFIX, tags=["wow-triage"])

    @router.get("/inbox", response_model=TriageInbox)
    async def inbox(_actor: str = Depends(require_triage_actor)) -> TriageInbox:
        return await feature_triage_service.get_inbox()

    @router.get("/stories", response_model=TriageStoryList)
    async def stories(
        status_filter: list[StoryStatus] | None = Query(default=None, alias="status"),
        _actor: str = Depends(require_triage_actor),
    ) -> TriageStoryList:
        return await feature_triage_service.list_stories(statuses=status_filter)

    @router.patch("/stories/{story_id:uuid}", response_model=TriageStory)
    async def patch_story(
        story_id: uuid.UUID,
        body: TriageStoryPatch,
        if_match: str | None = Header(default=None),
        actor: str = Depends(require_triage_actor),
    ) -> TriageStory:
        version = _required_if_match(if_match)
        try:
            return await feature_triage_service.patch_story(story_id, body, if_match=version, actor=actor)
        except FeatureRequestError as exc:
            raise _http_error(exc, conflict_detail=DETAIL_STATUS_CONFLICT) from exc

    @router.post("/stories/{story_id:uuid}/merge", response_model=TriageMergeResult)
    async def merge_story(
        story_id: uuid.UUID,
        body: TriageMergeRequest,
        if_match: str | None = Header(default=None),
        actor: str = Depends(require_triage_actor),
    ) -> TriageMergeResult:
        version = _required_if_match(if_match)
        try:
            return await feature_triage_service.merge_story(
                story_id, body.into_story_id, if_match=version, actor=actor
            )
        except FeatureRequestError as exc:
            raise _http_error(exc, conflict_detail=DETAIL_MERGE_CONFLICT) from exc

    @router.post("/submissions/mark-triaged", response_model=TriageMarkTriagedResult)
    async def mark_triaged(
        body: TriageMarkTriagedRequest, actor: str = Depends(require_triage_actor)
    ) -> TriageMarkTriagedResult:
        return await feature_triage_service.mark_triaged(body.submission_ids, actor=actor)

    return router
