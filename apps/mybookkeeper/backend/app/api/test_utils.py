import datetime as _dt
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as _sa_delete

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.config import settings
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.applicants.applicant import Applicant
from app.models.applicants.screening_result import ScreeningResult
from app.models.user.user import Role, User
from app.repositories import (
    inquiry_repo,
    integration_repo,
    listing_blackout_repo,
    listing_repo,
)
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    reference_repo,
    screening_result_repo,
    video_call_note_repo,
)
from app.repositories.vendors import vendor_repo
from app.repositories.user import user_repo
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.schemas.inquiries.inquiry_response import InquiryResponse
from app.schemas.user.user import UserRead
from app.services.inquiries import inquiry_service
from app.services.email import gmail_service
from app.services.integrations import integration_service

router = APIRouter(prefix="/test", tags=["test"])


def _require_test_mode() -> None:
    if not settings.allow_test_admin_promotion:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/promote-admin", response_model=UserRead)
async def promote_to_admin(
    user: User = Depends(current_active_user),
) -> User:
    _require_test_mode()

    if user.role == Role.ADMIN:
        return user

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user.id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        await user_repo.update_role(db, target, Role.ADMIN)
        return target


class _SeedListingRequest(BaseModel):
    property_id: uuid.UUID
    title: str = "E2E Test Listing"
    monthly_rate: Decimal = Decimal("1500.00")
    room_type: str = "private_room"
    status: str = "active"


class _SeedListingResponse(BaseModel):
    id: uuid.UUID


@router.post("/seed-listing", response_model=_SeedListingResponse)
async def seed_listing(
    payload: _SeedListingRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedListingResponse:
    """Test-only direct insert for E2E test seeding.

    PR 1.1a ships read-only listings endpoints. Until PR 1.2 adds the public
    POST /listings, the E2E suite needs this seeded path to exercise full
    create-fetch-cleanup flows. Gated by ALLOW_TEST_ADMIN_PROMOTION (off in
    production).
    """
    _require_test_mode()
    async with unit_of_work() as db:
        created = await listing_repo.create_listing(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            property_id=payload.property_id,
            title=payload.title,
            monthly_rate=payload.monthly_rate,
            room_type=payload.room_type,
            status=payload.status,
        )
        return _SeedListingResponse(id=created.id)


@router.delete("/listings/{listing_id}", status_code=204)
async def delete_listing(
    listing_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a listing for E2E cleanup. Test-only."""
    _require_test_mode()
    async with unit_of_work() as db:
        await listing_repo.hard_delete_by_id(db, listing_id, ctx.organization_id)


class _SeedBlackoutRequest(BaseModel):
    listing_id: uuid.UUID
    starts_on: _dt.date
    ends_on: _dt.date
    source: str = "airbnb"
    source_event_id: str | None = None


class _SeedBlackoutResponse(BaseModel):
    id: uuid.UUID


@router.post("/seed-blackout", response_model=_SeedBlackoutResponse)
async def seed_blackout(
    payload: _SeedBlackoutRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedBlackoutResponse:
    """Test-only direct insert for unified-calendar E2E seeding.

    Production blackout writes go through the iCal poll job; this seed
    endpoint exists so the E2E suite has a deterministic data path
    without spinning up a fake iCal feed. Tenant-scoped via the parent
    listing's organization_id.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, payload.listing_id, ctx.organization_id)
        if listing is None:
            raise HTTPException(status_code=404, detail="Listing not found")
        row = await listing_blackout_repo.create(
            db,
            listing_id=payload.listing_id,
            starts_on=payload.starts_on,
            ends_on=payload.ends_on,
            source=payload.source,
            source_event_id=payload.source_event_id,
        )
        return _SeedBlackoutResponse(id=row.id)


@router.delete("/blackouts/{blackout_id}", status_code=204)
async def delete_blackout(
    blackout_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a blackout for E2E cleanup. Test-only.

    Tenant-scoped via JOIN to ``listings.organization_id`` (enforced
    inside the repository helper).
    """
    _require_test_mode()
    async with unit_of_work() as db:
        await listing_blackout_repo.delete_by_id_scoped_to_organization(
            db,
            blackout_id=blackout_id,
            organization_id=ctx.organization_id,
        )


@router.post("/seed-inquiry", response_model=InquiryResponse)
async def seed_inquiry(
    payload: InquiryCreateRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> InquiryResponse:
    """Test-only direct insert for E2E inquiry seeding.

    PR 2.1a ships the public POST /inquiries already, but the E2E suite uses
    this endpoint to bypass dedup (``InquiryConflictError``) when the same
    test re-runs and to keep test data reproducible across re-runs. Gated by
    ``ALLOW_TEST_ADMIN_PROMOTION`` (off in production).
    """
    _require_test_mode()
    try:
        return await inquiry_service.create_inquiry(
            ctx.organization_id, ctx.user_id, payload,
        )
    except inquiry_service.InquiryConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/inquiries/{inquiry_id}", status_code=204)
async def delete_inquiry(
    inquiry_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete an inquiry (and cascade messages + events) for E2E cleanup.

    Production code path uses soft-delete (``deleted_at``); the E2E suite needs
    a true cleanup so test artifacts don't accumulate per
    ``feedback_clean_test_data``.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        await inquiry_repo.hard_delete_by_id(db, inquiry_id, ctx.organization_id)


class _SeedGmailRequest(BaseModel):
    has_send_scope: bool = True


@router.post("/seed-gmail-integration", status_code=204)
async def seed_gmail_integration(
    payload: _SeedGmailRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Test-only endpoint that creates (or updates) a Gmail integration with
    a known scope state, so the E2E reply flow can run without going through
    Google's OAuth servers.
    """
    _require_test_mode()
    scopes = [integration_service.GMAIL_READONLY_SCOPE]
    if payload.has_send_scope:
        scopes.append(integration_service.GMAIL_SEND_SCOPE)
    expiry = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1)
    async with unit_of_work() as db:
        await integration_repo.upsert_gmail(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            access_token="test-access-token",
            refresh_token="test-refresh-token",
            token_expiry=expiry,
            scopes=scopes,
        )


@router.delete("/seed-gmail-integration", status_code=204)
async def remove_gmail_integration(
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Cleanup counterpart to seed-gmail-integration."""
    _require_test_mode()
    async with unit_of_work() as db:
        existing = await integration_repo.get_by_org_and_provider(
            db, ctx.organization_id, "gmail",
        )
        if existing is not None:
            await integration_repo.delete(db, existing)


@router.post("/mock-gmail-send/enable", status_code=204)
async def enable_mock_gmail_send(
    ctx: RequestContext = Depends(current_org_member),  # noqa: ARG001 — gated by ctx
) -> None:
    """Replace ``gmail_service.send_message`` with a stub that returns a fake
    message-id. Used by E2E so tests don't hit the Gmail API.

    The patch lives at module level — the next ``send_reply`` call sees the
    stub. ``disable`` restores the original.
    """
    _require_test_mode()
    if getattr(gmail_service, "_real_send_message", None) is None:
        gmail_service._real_send_message = gmail_service.send_message  # type: ignore[attr-defined]

    def _stub(*args: object, **kwargs: object) -> str:
        return f"<e2e-mock-{uuid.uuid4().hex[:12]}@mybookkeeper.app>"

    gmail_service.send_message = _stub  # type: ignore[assignment]


@router.post("/mock-gmail-send/disable", status_code=204)
async def disable_mock_gmail_send(
    ctx: RequestContext = Depends(current_org_member),  # noqa: ARG001
) -> None:
    """Restore the real ``gmail_service.send_message`` after E2E."""
    _require_test_mode()
    real = getattr(gmail_service, "_real_send_message", None)
    if real is not None:
        gmail_service.send_message = real  # type: ignore[assignment]
        gmail_service._real_send_message = None  # type: ignore[attr-defined]


class _SeedApplicantRequest(BaseModel):
    inquiry_id: uuid.UUID | None = None
    legal_name: str | None = None
    dob: str | None = None
    employer_or_hospital: str | None = None
    vehicle_make_model: str | None = None
    smoker: bool | None = None
    pets: str | None = None
    referred_by: str | None = None
    stage: str = "lead"
    seed_event: bool = True
    seed_screening: bool = False
    seed_reference: bool = False
    seed_video_call_note: bool = False


class _SeedApplicantResponse(BaseModel):
    id: uuid.UUID


@router.post("/seed-applicant", response_model=_SeedApplicantResponse)
async def seed_applicant(
    payload: _SeedApplicantRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedApplicantResponse:
    """Test-only direct insert for E2E applicant seeding.

    Bypasses the (yet-to-be-built) PR 3.2 promotion flow so the read-only
    PR 3.1b frontend can be exercised end-to-end. Gated by
    ``ALLOW_TEST_ADMIN_PROMOTION`` (off in production).

    Optional flags ``seed_event`` / ``seed_screening`` / ``seed_reference`` /
    ``seed_video_call_note`` create a representative child row each so the
    detail page renders every section.
    """
    _require_test_mode()
    now = _dt.datetime.now(_dt.timezone.utc)
    async with unit_of_work() as db:
        applicant = await applicant_repo.create(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            inquiry_id=payload.inquiry_id,
            legal_name=payload.legal_name,
            dob=payload.dob,
            employer_or_hospital=payload.employer_or_hospital,
            vehicle_make_model=payload.vehicle_make_model,
            smoker=payload.smoker,
            pets=payload.pets,
            referred_by=payload.referred_by,
            stage=payload.stage,
        )
        if payload.seed_event:
            await applicant_event_repo.append(
                db,
                applicant_id=applicant.id,
                event_type="lead",
                actor="host",
                occurred_at=now,
            )
        if payload.seed_screening:
            await screening_result_repo.create(
                db,
                applicant_id=applicant.id,
                provider="keycheck",
                requested_at=now,
                # Seed flow has no real uploader — fall back to the parent
                # applicant's owner so the NOT NULL FK is satisfied.
                uploaded_by_user_id=ctx.user_id,
                status="pending",
            )
        if payload.seed_reference:
            await reference_repo.create(
                db,
                applicant_id=applicant.id,
                relationship="employer",
                reference_name="E2E Reference",
                reference_contact="ref@example.com",
            )
        if payload.seed_video_call_note:
            await video_call_note_repo.create(
                db,
                applicant_id=applicant.id,
                scheduled_at=now,
                completed_at=None,
                gut_rating=4,
                notes="E2E video call note",
            )
        return _SeedApplicantResponse(id=applicant.id)


@router.delete("/screening/{screening_id}", status_code=204)
async def delete_screening_result(
    screening_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a screening_result row for E2E cleanup. Test-only.

    PR 3.3 (KeyCheck redirect-only) introduces this cleanup hook so the
    ``applicant-screening.spec.ts`` E2E test can leave the DB clean per
    ``feedback_clean_test_data``. The applicant rows themselves stay —
    cleanup of the parent applicant uses ``DELETE /test/applicants/<id>``.
    Tenant-scoped via the parent applicant's ``(organization_id, user_id)``.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        # Tenant-scoped JOIN — the screening row inherits scope from its
        # parent applicant. Delete only if the calling org owns the parent.
        from sqlalchemy import select as _sa_select
        result = await db.execute(
            _sa_select(ScreeningResult)
            .join(Applicant, Applicant.id == ScreeningResult.applicant_id)
            .where(
                ScreeningResult.id == screening_id,
                Applicant.organization_id == ctx.organization_id,
                Applicant.user_id == ctx.user_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return
        await db.execute(
            _sa_delete(ScreeningResult).where(ScreeningResult.id == screening_id),
        )


@router.delete("/applicants/{applicant_id}", status_code=204)
async def delete_applicant(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete an applicant (cascades children) for E2E cleanup.

    Production code path uses soft-delete (``deleted_at``); the E2E suite needs
    a true cleanup so test artifacts don't accumulate per
    ``feedback_clean_test_data``.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        # Use the repo to confirm tenant scope before deleting via raw SQL —
        # there's no hard_delete helper on the repo (the production flow is
        # soft-delete). The cascade FK on the children does the cleanup.
        existing = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            include_deleted=True,
        )
        if existing is None:
            return
        await db.execute(
            _sa_delete(Applicant).where(Applicant.id == applicant_id),
        )


class _SeedVendorRequest(BaseModel):
    name: str = "E2E Test Vendor"
    category: str = "handyman"
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    hourly_rate: Decimal | None = None
    flat_rate_notes: str | None = None
    preferred: bool = False
    notes: str | None = None


class _SeedVendorResponse(BaseModel):
    id: uuid.UUID


@router.post("/seed-vendor", response_model=_SeedVendorResponse)
async def seed_vendor(
    payload: _SeedVendorRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedVendorResponse:
    """Test-only direct insert for E2E vendor seeding.

    PR 4.1a ships read-only vendor endpoints. Until PR 4.2 adds the public
    POST /vendors, the E2E suite needs this seeded path to exercise full
    create-fetch-cleanup flows. Gated by ``ALLOW_TEST_ADMIN_PROMOTION`` (off
    in production).
    """
    _require_test_mode()
    async with unit_of_work() as db:
        created = await vendor_repo.create(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            name=payload.name,
            category=payload.category,
            phone=payload.phone,
            email=payload.email,
            address=payload.address,
            hourly_rate=payload.hourly_rate,
            flat_rate_notes=payload.flat_rate_notes,
            preferred=payload.preferred,
            notes=payload.notes,
        )
        return _SeedVendorResponse(id=created.id)


@router.delete("/vendors/{vendor_id}", status_code=204)
async def delete_vendor(
    vendor_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a vendor for E2E cleanup. Test-only.

    Production code path uses soft-delete (``deleted_at``); the E2E suite
    needs a true cleanup so test artifacts don't accumulate per
    ``feedback_clean_test_data``.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        await vendor_repo.hard_delete_by_id(
            db,
            vendor_id=vendor_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
        )
