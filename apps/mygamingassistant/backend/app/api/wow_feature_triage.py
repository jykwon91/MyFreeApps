"""WoW Forever feature-request TRIAGE API — operator-only (the signed-in
superuser), mounted in BOTH modes. In serve-only prod it is the one content
write surface, behind the operator sign-in.

Routes (all under /api/wow/feature-requests/triage):
    GET   /inbox                         — untriaged submissions (+ total)
    GET   /stories?status=               — every story incl. private fields
    PATCH /stories/{id}                  — allowlisted edits; If-Match required
    POST  /stories/{id}/merge            — merge into another; If-Match required
    POST  /submissions/mark-triaged      — clear submissions from the inbox

Router-level dependencies: ``current_superuser`` (401 signed out, 403 for a
signed-in non-superuser) and ``Cache-Control: no-store`` on every answer the
handlers return. The audit actor is the signed-in operator (the
``set_audit_user`` middleware). No delete endpoint.
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status

from app.core.if_match import parse_if_match
from app.core.permissions import current_superuser
from app.core.wow_feature_request_limits import (
    DETAIL_IF_MATCH_INVALID,
    DETAIL_IF_MATCH_REQUIRED,
    DETAIL_MERGE_CONFLICT,
    DETAIL_NOT_FOUND,
    DETAIL_STATUS_CONFLICT,
    DETAIL_STORY_CHANGED,
    TRIAGE_PATH_PREFIX,
)
from app.models.user.user import User
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

_NO_STORE = "no-store"


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = _NO_STORE


def _actor(operator: User) -> str:
    """The operator in the triage log lines — the user id, never the email."""
    return str(operator.id)


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
    # Merge is irreversible but stays on plain current_superuser, not the strict
    # gate: the strict gate wants a fresh TOTP code on every request, and a
    # merge only moves votes / submissions between feature stories.
    router = APIRouter(
        prefix=TRIAGE_PATH_PREFIX,
        tags=["wow-triage"],
        dependencies=[Depends(current_superuser), Depends(_no_store)],
    )

    @router.get("/inbox", response_model=TriageInbox)
    async def inbox() -> TriageInbox:
        return await feature_triage_service.get_inbox()

    @router.get("/stories", response_model=TriageStoryList)
    async def stories(
        status_filter: list[StoryStatus] | None = Query(default=None, alias="status"),
    ) -> TriageStoryList:
        return await feature_triage_service.list_stories(statuses=status_filter)

    @router.patch("/stories/{story_id:uuid}", response_model=TriageStory)
    async def patch_story(
        story_id: uuid.UUID,
        body: TriageStoryPatch,
        if_match: str | None = Header(default=None),
        operator: User = Depends(current_superuser),
    ) -> TriageStory:
        version = _required_if_match(if_match)
        try:
            return await feature_triage_service.patch_story(
                story_id, body, if_match=version, actor=_actor(operator)
            )
        except FeatureRequestError as exc:
            raise _http_error(exc, conflict_detail=DETAIL_STATUS_CONFLICT) from exc

    @router.post("/stories/{story_id:uuid}/merge", response_model=TriageMergeResult)
    async def merge_story(
        story_id: uuid.UUID,
        body: TriageMergeRequest,
        if_match: str | None = Header(default=None),
        operator: User = Depends(current_superuser),
    ) -> TriageMergeResult:
        version = _required_if_match(if_match)
        try:
            return await feature_triage_service.merge_story(
                story_id, body.into_story_id, if_match=version, actor=_actor(operator)
            )
        except FeatureRequestError as exc:
            raise _http_error(exc, conflict_detail=DETAIL_MERGE_CONFLICT) from exc

    @router.post("/submissions/mark-triaged", response_model=TriageMarkTriagedResult)
    async def mark_triaged(
        body: TriageMarkTriagedRequest, operator: User = Depends(current_superuser)
    ) -> TriageMarkTriagedResult:
        return await feature_triage_service.mark_triaged(body.submission_ids, actor=_actor(operator))

    return router
