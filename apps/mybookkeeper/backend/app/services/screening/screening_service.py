"""Screening service — orchestrates redirect lookup + result upload pipeline.

Per the layered-architecture rule: services orchestrate (load → decide →
shape → persist), repositories own queries, routes are thin shells.

PR 3.3 ships KeyCheck redirect-only; scrnv2260503 (UX rebuild) adds:
- ``get_provider`` now also registers RentSpree.
- ``get_eligibility`` — pure eligibility gate: has_name + has_contact, and
  whether there's already a ``pending`` result in flight.
- ``list_providers`` — static provider metadata for the frontend grid.

Tenant scoping is via the parent applicant — the screening_results row has
no ``organization_id`` of its own (RENTALS_PLAN.md §8.1). Every entry point
proves applicant ownership before touching storage or the row.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from typing import Protocol

from app.core.applicant_enums import SCREENING_PROVIDERS, SCREENING_STATUSES
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.models.applicants.screening_result import ScreeningResult
from app.models.inquiries.inquiry import Inquiry
from app.models.system.audit_log import AuditLog
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    screening_result_repo,
)
from app.schemas.applicants.screening_eligibility_response import (
    ScreeningEligibilityResponse,
)
from app.schemas.applicants.screening_provider_response import (
    ScreeningProviderInfo,
    ScreeningProvidersResponse,
)
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.services.screening.keycheck_provider import KeyCheckProvider
from app.services.screening.rentspree_provider import RentSpreeProvider
from app.services.screening.report_processor import (
    ProcessedReport,
    ReportRejected,
    process_report,
)
from app.services.screening.screening_response_builder import attach_presigned_urls

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Provider Protocol + registry
# --------------------------------------------------------------------------- #

class ScreeningProvider(Protocol):
    """Contract every screening provider implementation must satisfy.

    Today the contract is intentionally narrow — at our scale every provider
    we'd integrate with is redirect-only. When (and if) we move to a real
    API tier we'll widen this Protocol to expose ``submit_request`` /
    ``poll_status`` etc.
    """

    name: str

    def dashboard_url(self) -> str:
        """Return the URL to redirect the host to."""
        ...


_PROVIDER_REGISTRY: dict[str, ScreeningProvider] = {
    "keycheck": KeyCheckProvider(),
    "rentspree": RentSpreeProvider(),
}

# Static provider metadata for the frontend grid. Costs / turnaround are
# approximate, operator-facing copy — not a binding quote. Ordered: free
# provider first, paid second.
_PROVIDER_GRID: list[ScreeningProviderInfo] = [
    ScreeningProviderInfo(
        name="keycheck",
        label="KeyCheck",
        description=(
            "Run a comprehensive background check on your applicant — "
            "credit, criminal, and eviction history in one report."
        ),
        cost_label="Free",
        turnaround_label="Usually 1–2 days",
        external_url="https://www.keycheck.com/dashboard",
    ),
    ScreeningProviderInfo(
        name="rentspree",
        label="RentSpree",
        description=(
            "Applicant-pays screening with instant identity verification, "
            "credit report, and background check. No cost to you as the host."
        ),
        cost_label="Paid by applicant",
        turnaround_label="Usually same day",
        external_url="https://app.rentspree.com/property-manager",
    ),
]


class ScreeningServiceError(RuntimeError):
    """Base error for the screening service layer."""


class UnknownProviderError(ScreeningServiceError):
    """Raised when a caller asks for a provider that isn't registered."""


class ScreeningUploadValidationError(ScreeningServiceError):
    """Raised when the upload payload fails business validation
    (e.g. unknown status, missing required snippet for adverse outcomes).

    Distinct from ``ReportRejected`` (which is a §8.5 file-safety failure).
    """


class StorageNotConfiguredError(ScreeningServiceError):
    """Object storage required for the screening upload is unavailable.

    The route handler maps this to HTTP 503 — uploads need somewhere to go.
    """


def get_provider(name: str) -> ScreeningProvider:
    """Look up a screening provider by name. Raises ``UnknownProviderError``
    if the provider isn't registered."""
    if name not in _PROVIDER_REGISTRY:
        registered = ", ".join(sorted(_PROVIDER_REGISTRY.keys()))
        raise UnknownProviderError(
            f"unknown screening provider {name!r} (registered: {registered})",
        )
    if name not in SCREENING_PROVIDERS:
        # Defensive: registry should never contain a provider that isn't on
        # the model's CHECK constraint allowlist. If this fires it's a bug
        # in the registry initialisation.
        raise ScreeningServiceError(
            f"provider {name!r} is registered but not in SCREENING_PROVIDERS",
        )
    return _PROVIDER_REGISTRY[name]


# --------------------------------------------------------------------------- #
# Outcome → DB status mapping
# --------------------------------------------------------------------------- #

# Outcomes that REQUIRE an adverse-action snippet — failing the screening or
# returning an inconclusive result both can drive an FCRA adverse-action
# notice, so the host must enter a short reason at upload time.
_ADVERSE_OUTCOMES: frozenset[str] = frozenset({"fail", "inconclusive"})


def _validate_upload_payload(status: str, adverse_action_snippet: str | None) -> None:
    if status not in SCREENING_STATUSES:
        allowed = ", ".join(SCREENING_STATUSES)
        raise ScreeningUploadValidationError(
            f"status must be one of: {allowed} (got {status!r})",
        )
    if status in _ADVERSE_OUTCOMES and not (adverse_action_snippet or "").strip():
        raise ScreeningUploadValidationError(
            f"adverse_action_snippet is required when status is {status!r}",
        )


# --------------------------------------------------------------------------- #
# Storage helpers
# --------------------------------------------------------------------------- #

def _build_storage_key(applicant_id: uuid.UUID, content_type: str) -> str:
    """Build the MinIO key for a screening report.

    Per RENTALS_PLAN.md §8.5 the prefix is ``screening/<applicant_id>/`` so
    bucket policies can scope retention / access on the prefix alone. The
    leaf is a UUID with a content-type-derived extension so the host's
    download fetches the right MIME.
    """
    ext = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
    }.get(content_type, "bin")
    return f"screening/{applicant_id}/{uuid.uuid4()}.{ext}"


# --------------------------------------------------------------------------- #
# Audit helper
# --------------------------------------------------------------------------- #

def _audit_event(
    db,
    *,
    record_id: str,
    operation: str,
    user_id: uuid.UUID,
    field_name: str,
    new_value: str,
) -> None:
    """Write a semantic audit-log entry alongside the listener-captured INSERT.

    Listener-captured rows (from ``core.audit``) cover the column-level
    diff. This entry adds a single, queryable "this is the business event
    that just fired" row — used by the admin audit feed to render
    "screening.result_uploaded" in the timeline without joining 12 column
    rows together.
    """
    db.add(AuditLog(
        table_name="screening_results",
        record_id=record_id,
        operation=operation,
        field_name=field_name,
        old_value=None,
        new_value=new_value,
        changed_by=str(user_id),
    ))


# --------------------------------------------------------------------------- #
# Public service surface
# --------------------------------------------------------------------------- #

async def initiate_redirect(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    provider_name: str = "keycheck",
) -> tuple[str, str]:
    """Resolve the dashboard URL for the host to be redirected to.

    Returns ``(redirect_url, provider_name)``. Raises ``LookupError`` if the
    applicant doesn't exist in the calling tenant, or
    ``UnknownProviderError`` if the provider isn't registered.

    Side effects: emits ``screening.redirect_initiated`` to ``audit_logs``.
    """
    provider = get_provider(provider_name)
    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")
        url = provider.dashboard_url()
        _audit_event(
            db,
            record_id=str(applicant_id),
            operation="REDIRECT",
            user_id=user_id,
            field_name="screening.redirect_initiated",
            new_value=f"{provider.name}:{url}",
        )
    return url, provider.name


async def record_result(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    file_content: bytes,
    declared_content_type: str | None,
    status: str,
    adverse_action_snippet: str | None,
    provider_name: str = "keycheck",
) -> ScreeningResultResponse:
    """Run the §8.5 upload pipeline and persist a screening_result row.

    Pipeline:
        validate(status, snippet)
        → process_report (size + sniff + ClamAV + EXIF strip)
        → applicant ownership check (404)
        → storage.upload_file
        → screening_result_repo.create
        → applicant_event_repo.append("screening_completed")
        → audit_event("screening.result_uploaded")

    Errors are surfaced as the route-typed exceptions:
        LookupError                       — applicant missing / wrong tenant
        ScreeningUploadValidationError    — bad status / missing snippet
        ReportRejected                    — file failed safety pipeline
        StorageNotConfiguredError         — MinIO unconfigured
        UnknownProviderError              — bad provider name

    Persists with ``status`` from the host (never "pending" — this endpoint
    is for completed reports), ``provider`` from the registry, ``uploaded_by_user_id``
    from the request context, and an automatic ``uploaded_at`` server-side.
    """
    _validate_upload_payload(status, adverse_action_snippet)
    provider = get_provider(provider_name)
    processed: ProcessedReport = process_report(
        file_content, declared_content_type=declared_content_type,
    )

    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    storage_key = _build_storage_key(applicant_id, processed.content_type)

    # Upload BEFORE the DB transaction so a storage failure rolls back
    # cleanly without leaving an orphan DB row.
    storage.upload_file(storage_key, processed.content, processed.content_type)

    try:
        async with unit_of_work() as db:
            applicant = await applicant_repo.get(
                db,
                applicant_id=applicant_id,
                organization_id=organization_id,
                user_id=user_id,
            )
            if applicant is None:
                raise LookupError(f"Applicant {applicant_id} not found")

            now = _dt.datetime.now(_dt.timezone.utc)
            result = await screening_result_repo.create(
                db,
                applicant_id=applicant_id,
                provider=provider.name,
                requested_at=now,
                completed_at=now,
                uploaded_by_user_id=user_id,
                status=status,
                report_storage_key=storage_key,
                adverse_action_snippet=(adverse_action_snippet or None),
            )

            await applicant_event_repo.append(
                db,
                applicant_id=applicant_id,
                event_type="screening_completed",
                actor="host",
                occurred_at=now,
                notes=f"{provider.name}:{status}",
            )

            _audit_event(
                db,
                record_id=str(result.id),
                operation="UPLOAD",
                user_id=user_id,
                field_name="screening.result_uploaded",
                # Reference the storage key (never the file content) per
                # the PR 3.3 PII-handling requirement.
                new_value=f"{provider.name}:{status}:{storage_key}",
            )
            response = ScreeningResultResponse.model_validate(result)
    except Exception:
        # Best-effort cleanup of the just-uploaded object so we don't leak
        # storage on partial failures (mirrors listing_photo_service).
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete orphan screening report %s after DB error",
                storage_key,
                exc_info=True,
            )
        raise

    return attach_presigned_urls([response])[0]


async def list_results(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> list[ScreeningResultResponse]:
    """List every screening result for an applicant, newest-uploaded first.

    Returns [] when the applicant doesn't belong to the calling tenant —
    the join in the repo silently filters them out, no separate 404 path.
    The route handler verifies applicant existence and returns 404 there.
    """
    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")
        rows = await screening_result_repo.list_for_applicant(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
    responses = [ScreeningResultResponse.model_validate(r) for r in rows]
    return attach_presigned_urls(responses)


def list_providers() -> ScreeningProvidersResponse:
    """Return the static provider grid metadata for the frontend.

    Pure function — no I/O. The grid is baked into the service layer so it
    can be unit-tested without HTTP overhead and stays in sync with the
    provider registry.
    """
    return ScreeningProvidersResponse(providers=_PROVIDER_GRID)


async def get_eligibility(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> ScreeningEligibilityResponse:
    """Compute whether the applicant is ready to be screened.

    Eligibility criteria:
    1. ``legal_name`` is set — providers need a full legal name to run a
       background check.
    2. At least one contact method is available (``inquirer_email`` or
       ``inquirer_phone`` from the linked Inquiry, when one exists).

    ``has_pending`` — True iff there's already a screening_result with
    status "pending" in flight. The frontend uses this to show a waiting
    indicator instead of the provider grid.

    Raises ``LookupError`` if the applicant doesn't exist in the calling
    tenant (same contract as every other service function here).
    """
    from sqlalchemy import select

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")

        # Check for in-flight pending screening result.
        pending_result = await db.execute(
            select(ScreeningResult).where(
                ScreeningResult.applicant_id == applicant_id,
                ScreeningResult.status == "pending",
            ).limit(1)
        )
        has_pending = pending_result.scalar_one_or_none() is not None

        # Derive contact info from linked Inquiry.
        has_email = False
        has_phone = False
        if applicant.inquiry_id is not None:
            inq_result = await db.execute(
                select(
                    Inquiry.inquirer_email,
                    Inquiry.inquirer_phone,
                ).where(Inquiry.id == applicant.inquiry_id)
            )
            row = inq_result.one_or_none()
            if row is not None:
                has_email = bool(row.inquirer_email and str(row.inquirer_email).strip())
                has_phone = bool(row.inquirer_phone and str(row.inquirer_phone).strip())

    missing: list[str] = []
    if not (applicant.legal_name and str(applicant.legal_name).strip()):
        missing.append("Legal name")
    if not (has_email or has_phone):
        missing.append("Email or phone (from the linked inquiry)")

    return ScreeningEligibilityResponse(
        eligible=len(missing) == 0,
        missing_fields=missing,
        has_pending=has_pending,
    )
