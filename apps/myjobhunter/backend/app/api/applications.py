"""HTTP routes for the Applications domain.

Phase 1 shipped read-only ``GET /applications``. Phase 2 (this PR) ships:
- Full CRUD (POST / GET list / GET detail / PATCH / DELETE)
- Event log (GET + POST /events)
- Contact management (POST + DELETE /contacts)
- List filters (status, archived, since, pagination)

Phase 4 (this PR) adds:
- POST /applications/parse-jd — AI-powered JD field extraction via Claude

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory — every operation
scopes the query by ``user.id`` so cross-tenant access yields HTTP 404 with
the same body as a genuine miss (no existence leak).

Audit: writes are captured automatically by the shared SQLAlchemy
``after_flush`` listener registered in ``app.main`` lifespan — no manual
instrumentation needed in the route handlers.

Pattern reference: MyBookkeeper vendors PR #108 (sibling app in the
``MyFreeApps`` monorepo). The route → service → repo split, allowlisted
PATCH semantics, soft-delete idempotency, and 404-on-cross-tenant policy
all mirror that PR.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.rate_limit import RateLimiter, check_user_rate_limit
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.application.application_contact_create_request import ApplicationContactCreateRequest
from app.schemas.application.application_contact_response import ApplicationContactResponse
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_detail_response import ApplicationDetailResponse
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_event_response import ApplicationEventResponse
from app.schemas.application.application_event_update_request import ApplicationEventUpdateRequest
from app.schemas.application.application_response import ApplicationResponse
from app.schemas.application.application_transition_request import ApplicationTransitionRequest
from app.schemas.application.application_update_request import ApplicationUpdateRequest
from app.schemas.application.jd_parse_request import JdParseRequest
from app.schemas.application.jd_parse_response import JdParseResponse
from app.schemas.application.jd_url_extract_request import JdUrlExtractRequest
from app.schemas.application.jd_url_extract_response import JdUrlExtractResponse
from app.services.application import application_service
from app.services.application.application_service import (
    CompanyNotOwnedError,
    EventTypeNotEditableError,
)
from app.services.application.application_transition_service import (
    TransitionNotAllowedError,
    transition_application,
)
from app.services.application.jd_parsing_service import JdParseError, parse_jd
from app.services.extraction.jd_url_extractor import (
    JDFetchAuthRequiredError,
    JDFetchError,
    JDFetchTimeoutError,
    extract_from_url,
)

router = APIRouter()

_NOT_FOUND_DETAIL = "Application not found"
_CONTACT_NOT_FOUND_DETAIL = "Contact not found"
_EVENT_NOT_FOUND_DETAIL = "Event not found"
_EVENT_NOT_EDITABLE_DETAIL = "event_type does not support editing"

# Per-user rate limit for the JD URL extractor (outbound fetch + possible
# Claude call). 10 requests / 5 minutes is generous for a legitimate operator
# (one-paste-per-application throughput) but tight enough to prevent the
# endpoint being used as an SSRF probe or a free third-party HTML scraper.
# Keyed on user.id, not IP: users behind one carrier NAT must not share a
# budget. Pre-instantiated at module import so all requests share the same
# sliding-window state. In-memory per process and the API runs 2 uvicorn
# workers, so the effective budget is up to ~2x (same for the limiters below).
_JD_URL_EXTRACT_LIMITER = RateLimiter(max_attempts=10, window_seconds=300)

# Per-user limit for the paste-text JD parser: one Claude call per request,
# no fetch. A legitimate bulk-add pastes about one JD every 15-30 seconds, so
# 20 / 5 minutes covers that with headroom while capping a runaway client.
_JD_PARSE_LIMITER = RateLimiter(max_attempts=20, window_seconds=300)

# Per-user transition write limit for the kanban dashboard. Drag-drop on
# a flaky network can fire dozens of identical writes; the auto-save on
# the drawer's Notes textarea adds another stream. Keying on user.id
# (not IP) is correct for bearer-auth — the IP is network noise behind
# any NAT or VPN. Two limiters: a tight per-minute cap to soak burst
# misclicks, plus a wider per-hour cap to defend against a wedged client
# that retries forever.
_TRANSITION_LIMITER_PER_MIN = RateLimiter(max_attempts=30, window_seconds=60)
_TRANSITION_LIMITER_PER_HOUR = RateLimiter(max_attempts=200, window_seconds=3600)
_NOTES_PATCH_LIMITER_PER_MIN = RateLimiter(max_attempts=30, window_seconds=60)
_NOTES_PATCH_LIMITER_PER_HOUR = RateLimiter(max_attempts=200, window_seconds=3600)


@router.get("/applications/{application_id}", response_model=ApplicationDetailResponse)
async def get_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationDetailResponse:
    """Return a single Application with its events timeline and contacts.

    Returns 404 if the application is missing OR belongs to another user —
    callers cannot distinguish the two cases (no existence leak). Soft-deleted
    rows are not visible (the underlying repo filters ``deleted_at IS NULL``).

    The response includes:
    - ``events``: full event timeline, newest-first.
    - ``contacts``: all contacts associated with this application.
    """
    detail = await application_service.get_application_detail(db, user.id, application_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return detail


@router.post("/applications/parse-jd", response_model=JdParseResponse, status_code=200)
async def parse_job_description(
    payload: JdParseRequest,
    user: User = Depends(current_active_user),
) -> JdParseResponse:
    """Extract structured fields from a pasted job description using Claude.

    The caller pastes raw JD text; Claude returns a structured object with
    title, company, location, salary range, seniority, requirements, and
    a summary. The frontend pre-fills the Add Application form with the
    returned values and lets the user edit before saving.

    This endpoint does NOT persist an Application row — it is a stateless
    preview call. Pass the parsed fields alongside the rest of the form on
    ``POST /applications`` to actually save them.

    Rate limited per user (20 / 5 min); 429 when exceeded.

    Returns HTTP 502 if the Claude API call fails so the client can surface
    a clear "AI parsing unavailable" message rather than a generic 500.

    No ``db`` session needed — the only DB write is an extraction_log row
    written inside ``claude_service._record_log`` via its own session.
    """
    check_user_rate_limit(user.id, _JD_PARSE_LIMITER)
    try:
        result = await parse_jd(payload.jd_text, user.id)
    except JdParseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"JD parsing failed: {exc}",
        ) from exc
    return JdParseResponse(**result.to_dict())


@router.post(
    "/applications/extract-from-url",
    response_model=JdUrlExtractResponse,
    status_code=200,
)
async def extract_from_url_endpoint(
    payload: JdUrlExtractRequest,
    user: User = Depends(current_active_user),
) -> JdUrlExtractResponse:
    """Fetch a job-posting URL and extract structured fields from it.

    Two-tier strategy: schema.org JobPosting fast path for any modern ATS,
    Claude HTML-text fallback for everything else. Returns the extracted
    fields for client-side preview / form pre-fill — does NOT persist
    an Application row (the frontend then submits ``POST /applications``
    with the merged values once the user has reviewed them).

    Rate limit: 10 requests per 5 minutes per user. Bypassing requires
    going through ``POST /applications/parse-jd`` (the paste-text path),
    which has its own gating.

    Status codes:
    - 200 on success — body is the extracted ``JdUrlExtractResponse``.
    - 400 when the URL is malformed (non-http(s), missing host).
    - 422 ``auth_required`` when the URL is auth-walled (LinkedIn,
      Glassdoor) or when the fetched page returned <500 visible bytes
      after stripping. The frontend prompts the user to paste the
      description text instead.
    - 429 when the per-user rate limit is exceeded.
    - 502 when the upstream returned non-2xx, the body could not be
      parsed, or the Claude fallback failed.
    - 504 when the upstream fetch timed out.

    No DB session — the only persistence is an ``extraction_logs`` row
    written inside ``claude_service._record_log`` on the Tier-2 path
    via its own session.
    """
    check_user_rate_limit(user.id, _JD_URL_EXTRACT_LIMITER)

    url_str = str(payload.url)
    try:
        result = await extract_from_url(url_str, user_id=user.id)
    except JDFetchAuthRequiredError as exc:
        # 422 with a stable ``detail`` literal so the frontend can route
        # on it deterministically without parsing the human-readable
        # message.
        raise HTTPException(status_code=422, detail="auth_required") from exc
    except JDFetchTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Timed out fetching URL: {exc}",
        ) from exc
    except JDFetchError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't extract JD from URL: {exc}",
        ) from exc
    except ValueError as exc:
        # Defensive — Pydantic AnyHttpUrl should reject malformed URLs at
        # the schema layer, but service-level _validate_url adds a second
        # check for things like ``ftp://`` that slip through ``AnyHttpUrl``.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JdUrlExtractResponse(
        title=result.title,
        company=result.company,
        company_website=result.company_website,
        company_logo_url=result.company_logo_url,
        location=result.location,
        description_html=result.description_html,
        requirements_text=result.requirements_text,
        summary=result.summary,
        source_url=result.source_url,
    )


@router.post("/applications", response_model=ApplicationResponse, status_code=201)
async def create_application(
    payload: ApplicationCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Create a new Application scoped to the caller.

    HTTP 422 if ``company_id`` does not belong to the caller — the same
    response a malformed body would receive, so cross-tenant probing reveals
    nothing about which companies exist in another user's account.
    """
    try:
        application = await application_service.create_application(db, user.id, payload)
    except CompanyNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="company_id does not reference an accessible company",
        ) from exc
    return ApplicationResponse.model_validate(application)


@router.patch("/applications/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: uuid.UUID,
    payload: ApplicationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Apply a partial update to an Application.

    Returns 404 if the application is missing OR belongs to another user —
    callers cannot distinguish the two cases (no existence leak).

    Rate limited per user (30/min, 200/hr). The drawer's Notes field
    auto-saves on debounced change, which can fire dozens of patches in
    quick succession when the operator tabs through fields. Keying on
    ``user.id`` (not IP) is correct for bearer-auth — IP is network
    noise behind any NAT/VPN.
    """
    check_user_rate_limit(
        user.id,
        _NOTES_PATCH_LIMITER_PER_MIN,
        _NOTES_PATCH_LIMITER_PER_HOUR,
    )
    try:
        application = await application_service.update_application(
            db, user.id, application_id, payload,
        )
    except CompanyNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="company_id does not reference an accessible company",
        ) from exc
    if application is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationResponse.model_validate(application)


@router.post(
    "/applications/{application_id}/transitions",
    response_model=ApplicationEventResponse,
    status_code=201,
)
async def create_application_transition(
    application_id: uuid.UUID,
    payload: ApplicationTransitionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationEventResponse:
    """Persist a kanban-column drag as an event_log row.

    The kanban dashboard fires this on every drag-drop. The body carries
    the coarse-grained target column ("applied" / "interviewing" /
    "offer" / "closed") and an optional client-generated ``idempotency_key``.
    The service translates the column to a fine-grained event_type
    ("applied" / "interview_scheduled" / "offer_received" / "rejected"
    by default) and inserts the event with a server-side ``occurred_at``.

    Rate limited per user (30/min, 200/hr). Returns:
    - 201 with the created (or idempotency-resolved) ApplicationEventResponse.
    - 400 when the proposed transition is not allowed from the current column.
    - 404 when the application is missing or belongs to another user.
    - 429 when the per-user rate limit is exceeded.
    """
    check_user_rate_limit(
        user.id,
        _TRANSITION_LIMITER_PER_MIN,
        _TRANSITION_LIMITER_PER_HOUR,
    )

    try:
        event = await transition_application(
            db,
            application_id=application_id,
            target_column=payload.target_column,
            user_id=user.id,
            idempotency_key=payload.idempotency_key,
        )
    except TransitionNotAllowedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if event is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationEventResponse.model_validate(event)


@router.delete("/applications/{application_id}", status_code=204)
async def delete_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Soft-delete an Application by setting ``deleted_at``.

    Idempotent — calling DELETE on an already soft-deleted row still returns
    204 as long as the row exists under the caller's ``user_id``. Returns
    404 if the row does not exist or belongs to another user.
    """
    deleted = await application_service.soft_delete_application(db, user.id, application_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=204)


@router.get("/applications/{application_id}/events")
async def list_application_events(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """Return events for an application, newest first.

    Returns 404 if the application is missing or belongs to another user
    (no existence leak — same response as a genuine miss). Response
    shape mirrors the list endpoints: ``{"items": [...], "total": int}``.
    """
    events = await application_service.list_application_events(db, user.id, application_id)
    if events is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return {
        "items": [
            ApplicationEventResponse.model_validate(e).model_dump(mode="json") for e in events
        ],
        "total": len(events),
    }


@router.post(
    "/applications/{application_id}/events",
    response_model=ApplicationEventResponse,
    status_code=201,
)
async def create_application_event(
    application_id: uuid.UUID,
    payload: ApplicationEventCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationEventResponse:
    """Log a new event against an application.

    Returns 404 if the application is missing or belongs to another user.
    422 on schema violations (event_type not in enum, source not in enum,
    extra fields). Idempotency for sync-imported events lives on the
    UNIQUE(user_id, email_message_id) constraint — manual events
    intentionally don't carry email_message_id and so always insert.
    """
    event = await application_service.log_application_event(
        db, user.id, application_id, payload,
    )
    if event is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationEventResponse.model_validate(event)


@router.patch(
    "/applications/{application_id}/events/{event_id}",
    response_model=ApplicationEventResponse,
)
async def update_application_event(
    application_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: ApplicationEventUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationEventResponse:
    """Apply a partial update to an ApplicationEvent.

    Only the two user-input columns (``interview_details`` and ``note``)
    are editable, and only when the targeted event's ``event_type`` is
    ``interview_scheduled`` or ``interview_completed`` — system-generated
    events (``applied``, ``email_received``, kanban transitions) stay
    immutable so the audit trail remains trustworthy.

    Returns 404 if the event is missing OR belongs to another user
    OR is filed under a different application than ``application_id``.
    The composite WHERE on (event_id, application_id, user_id) is the
    canonical no-leak boundary; callers cannot distinguish the three
    cases.

    Returns 422 with detail ``event_type does not support editing``
    when the row exists but its event_type is outside the editable
    allowlist — the frontend already gates the edit UI to interview
    events, this is defense in depth.

    Rate limited per user (30/min, 200/hr).  Shares limiters with the
    application-level PATCH because both surfaces fire from the same
    drawer UI; users hammering one shouldn't bypass the other.
    """
    check_user_rate_limit(
        user.id,
        _NOTES_PATCH_LIMITER_PER_MIN,
        _NOTES_PATCH_LIMITER_PER_HOUR,
    )
    try:
        event = await application_service.update_application_event(
            db, user.id, application_id, event_id, payload,
        )
    except EventTypeNotEditableError as exc:
        raise HTTPException(
            status_code=422,
            detail=_EVENT_NOT_EDITABLE_DETAIL,
        ) from exc
    if event is None:
        raise HTTPException(status_code=404, detail=_EVENT_NOT_FOUND_DETAIL)
    return ApplicationEventResponse.model_validate(event)


@router.post(
    "/applications/{application_id}/contacts",
    response_model=ApplicationContactResponse,
    status_code=201,
)
async def create_application_contact(
    application_id: uuid.UUID,
    payload: ApplicationContactCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationContactResponse:
    """Add a contact (recruiter, HM, interviewer, etc.) to an application.

    Returns 404 if the application is missing or belongs to another user —
    no existence leak. 422 on schema violations (role not in enum, neither
    name nor email provided, extra fields).
    """
    contact = await application_service.create_application_contact(
        db, user.id, application_id, payload,
    )
    if contact is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationContactResponse.model_validate(contact)


@router.delete("/applications/{application_id}/contacts/{contact_id}", status_code=204)
async def delete_application_contact(
    application_id: uuid.UUID,
    contact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Remove a contact from an application.

    Composite WHERE on (contact_id, application_id, user_id) — a caller
    who knows a contact UUID but does not own the parent application is
    returned 404 (IDOR guard per PR #172 pattern). Returns 404 for any
    non-existent or cross-tenant row so callers cannot distinguish the
    two cases.
    """
    deleted = await application_service.delete_application_contact(
        db, user.id, application_id, contact_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail=_CONTACT_NOT_FOUND_DETAIL)
    return Response(status_code=204)
