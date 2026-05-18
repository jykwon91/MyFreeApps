"""Test-only seed and cleanup endpoints for E2E test data management."""

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as _sa_delete, select as _sa_select

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.applicants.applicant import Applicant
from app.models.applicants.screening_result import ScreeningResult
from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.repositories import (
    applicant_event_repo,
    applicant_repo,
    inquiry_repo,
    integration_repo,
    listing_blackout_repo,
    listing_repo,
    reference_repo,
    review_queue_repo,
    screening_result_repo,
    transaction_repo,
    video_call_note_repo,
)
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_repo,
)
from app.repositories.properties import property_repo
from app.repositories.transactions import attribution_repo
from app.repositories.vendors import vendor_repo
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.schemas.inquiries.inquiry_response import InquiryResponse
from app.services.integrations import integration_service
from app.services.inquiries import inquiry_service
from app.services.leases import receipt_service
from app.services.leases.default_source_map import get_default, guess_display_label
from app.services.leases.placeholder_extractor import extract_placeholder_keys
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


# ---------------------------------------------------------------------------
# Listings
# ---------------------------------------------------------------------------

class _SeedListingRequest(BaseModel):
    property_id: uuid.UUID
    title: str = "E2E Test Listing"
    monthly_rate: Decimal = Decimal("1500.00")
    room_type: str = "private_room"
    status: str = "active"


class _SeedListingResponse(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-listing", response_model=_SeedListingResponse)
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


@router.delete("/test/listings/{listing_id}", status_code=204)
async def delete_listing(
    listing_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a listing for E2E cleanup. Test-only."""
    _require_test_mode()
    async with unit_of_work() as db:
        await listing_repo.hard_delete_by_id(db, listing_id, ctx.organization_id)


# ---------------------------------------------------------------------------
# Blackouts
# ---------------------------------------------------------------------------

class _SeedBlackoutRequest(BaseModel):
    listing_id: uuid.UUID
    starts_on: _dt.date
    ends_on: _dt.date
    source: str = "airbnb"
    source_event_id: str | None = None


class _SeedBlackoutResponse(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-blackout", response_model=_SeedBlackoutResponse)
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


@router.delete("/test/blackouts/{blackout_id}", status_code=204)
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


# ---------------------------------------------------------------------------
# Inquiries
# ---------------------------------------------------------------------------

@router.post("/test/seed-inquiry", response_model=InquiryResponse)
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


@router.delete("/test/inquiries/{inquiry_id}", status_code=204)
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


# ---------------------------------------------------------------------------
# Gmail integration
# ---------------------------------------------------------------------------

class _SeedGmailRequest(BaseModel):
    has_send_scope: bool = True


@router.post("/test/seed-gmail-integration", status_code=204)
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


@router.delete("/test/seed-gmail-integration", status_code=204)
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


# ---------------------------------------------------------------------------
# Applicants
# ---------------------------------------------------------------------------

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


@router.post("/test/seed-applicant", response_model=_SeedApplicantResponse)
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


@router.delete("/test/screening/{screening_id}", status_code=204)
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


@router.delete("/test/applicants/{applicant_id}", status_code=204)
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


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

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


@router.post("/test/seed-vendor", response_model=_SeedVendorResponse)
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


@router.delete("/test/vendors/{vendor_id}", status_code=204)
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


# ---------------------------------------------------------------------------
# Lease Templates / Signed Leases — E2E seed + cleanup helpers (Phase 1)
# ---------------------------------------------------------------------------

class _SeedLeaseTemplateRequest(BaseModel):
    name: str = "E2E Lease Template"
    description: str | None = None
    # Source text for placeholder extraction. Defaults to a small sample
    # that exercises the common placeholder set.
    source_text: str = (
        "LEASE AGREEMENT\n\n"
        "This Lease is entered into on [EFFECTIVE DATE] between Landlord and "
        "[TENANT FULL NAME] (\"Tenant\").\n\n"
        "Tenant Email: [TENANT EMAIL]\n"
        "Term: [NUMBER OF DAYS] days, beginning [MOVE-IN DATE] and "
        "ending [MOVE-OUT DATE].\n"
    )


class _SeedLeaseTemplateResponse(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-lease-template", response_model=_SeedLeaseTemplateResponse)
async def seed_lease_template(
    payload: _SeedLeaseTemplateRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedLeaseTemplateResponse:
    """Test-only direct insert for E2E lease-template seeding.

    Bypasses MinIO upload — writes a single in-memory template_file row
    pointing at a fake storage_key. The E2E flow that exercises the upload
    pipeline uses the real ``POST /lease-templates`` endpoint via the UI.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        template = await lease_template_repo.create(
            db,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            name=payload.name,
            description=payload.description,
        )
        await lease_template_file_repo.create(
            db,
            template_id=template.id,
            filename="seed.md",
            storage_key=f"lease-templates/{template.id}/seed",
            content_type="text/markdown",
            size_bytes=len(payload.source_text),
            display_order=0,
        )
        keys = extract_placeholder_keys(payload.source_text)
        for order, key in enumerate(keys):
            seed = get_default(key)
            await lease_template_placeholder_repo.create(
                db,
                template_id=template.id,
                key=key,
                display_label=guess_display_label(key),
                input_type=seed.input_type,
                required=True,
                default_source=seed.default_source,
                computed_expr=seed.computed_expr,
                display_order=order,
            )
        return _SeedLeaseTemplateResponse(id=template.id)


@router.delete("/test/lease-templates/{template_id}", status_code=204)
async def hard_delete_lease_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a lease template (cascades files / placeholders). Test-only."""
    _require_test_mode()
    async with unit_of_work() as db:
        existing = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            include_deleted=True,
        )
        if existing is None:
            return
        await db.execute(_sa_delete(LeaseTemplate).where(LeaseTemplate.id == template_id))


class _SeedAttachmentSpec(BaseModel):
    filename: str = "seeded-lease.pdf"
    kind: str = "signed_lease"
    content_type: str = "application/pdf"


class _SeedSignedLeaseRequest(BaseModel):
    applicant_id: uuid.UUID | None = None
    kind: str = "imported"
    status: str = "signed"
    starts_on: _dt.date | None = None
    ends_on: _dt.date | None = None
    attachments: list[_SeedAttachmentSpec] = []


class _SeedSignedLeaseResponse(BaseModel):
    id: uuid.UUID
    attachment_ids: list[uuid.UUID] = []


@router.post("/test/seed-signed-lease", response_model=_SeedSignedLeaseResponse, status_code=201)
async def seed_signed_lease(
    payload: _SeedSignedLeaseRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedSignedLeaseResponse:
    """Test-only: create a signed lease (status=signed) with optional fake attachments.

    Bypasses MinIO — attachment storage_keys are fake paths. Suitable for
    testing import / attachment UX (kind picker, viewer links, PATCH kind
    endpoint) without requiring a real storage bucket.
    """
    _require_test_mode()
    now = _dt.datetime.now(_dt.timezone.utc)
    lease_id = uuid.uuid4()
    attachment_ids: list[uuid.UUID] = []

    async with unit_of_work() as db:
        lease = SignedLease(
            id=lease_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            applicant_id=payload.applicant_id,
            listing_id=None,
            kind=payload.kind,
            values={},
            status=payload.status,
            starts_on=payload.starts_on,
            ends_on=payload.ends_on,
            signed_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(lease)
        await db.flush()

        specs = payload.attachments or [_SeedAttachmentSpec()]
        for spec in specs:
            att_id = uuid.uuid4()
            att = SignedLeaseAttachment(
                id=att_id,
                lease_id=lease_id,
                storage_key=f"signed-leases/{lease_id}/{att_id}",
                filename=spec.filename,
                content_type=spec.content_type,
                size_bytes=1024,
                kind=spec.kind,
                uploaded_by_user_id=ctx.user_id,
                uploaded_at=now,
            )
            db.add(att)
            attachment_ids.append(att_id)

        await db.flush()

    return _SeedSignedLeaseResponse(id=lease_id, attachment_ids=attachment_ids)


@router.delete("/test/signed-leases/{lease_id}", status_code=204)
async def hard_delete_signed_lease(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a signed lease (cascades attachments). Test-only."""
    _require_test_mode()
    async with unit_of_work() as db:
        existing = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            include_deleted=True,
        )
        if existing is None:
            return
        await db.execute(_sa_delete(SignedLease).where(SignedLease.id == lease_id))


# ---------------------------------------------------------------------------
# Calendar review queue — E2E seed + cleanup helpers (Phase 2b)
# ---------------------------------------------------------------------------

class _SeedReviewQueueRequest(BaseModel):
    source_channel: str = "airbnb"
    email_message_id: str
    check_in: str
    check_out: str
    guest_name: str | None = None
    total_price: str | None = None
    source_listing_id: str | None = None
    raw_subject: str = "Reservation confirmed"


class _SeedReviewQueueResponse(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-review-queue-item", response_model=_SeedReviewQueueResponse, status_code=201)
async def seed_review_queue_item(
    payload: _SeedReviewQueueRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedReviewQueueResponse:
    """Test-only direct insert for E2E calendar Phase 2b seeding.

    Creates a pending review-queue item for the authenticated user's org
    without going through the Gmail sync pipeline. Gated by
    ``ALLOW_TEST_ADMIN_PROMOTION``.
    """
    _require_test_mode()
    parsed_payload = {
        "source_channel": payload.source_channel,
        "source_listing_id": payload.source_listing_id,
        "guest_name": payload.guest_name,
        "check_in": payload.check_in,
        "check_out": payload.check_out,
        "total_price": payload.total_price,
        "raw_subject": payload.raw_subject,
    }

    async with unit_of_work() as db:
        row = await review_queue_repo.insert_if_not_exists(
            db,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            email_message_id=payload.email_message_id,
            source_channel=payload.source_channel,
            parsed_payload=parsed_payload,
        )
        if row is None:
            # Already exists — fetch the existing row to return its id.
            result = await db.execute(
                _sa_select(CalendarEmailReviewQueue).where(
                    CalendarEmailReviewQueue.user_id == ctx.user_id,
                    CalendarEmailReviewQueue.email_message_id == payload.email_message_id,
                )
            )
            row = result.scalar_one()

    return _SeedReviewQueueResponse(id=row.id)


@router.delete("/test/review-queue/{item_id}", status_code=204)
async def hard_delete_review_queue_item(
    item_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a review-queue item for E2E cleanup. Test-only."""
    _require_test_mode()
    async with unit_of_work() as db:
        await db.execute(
            _sa_delete(CalendarEmailReviewQueue).where(
                CalendarEmailReviewQueue.id == item_id,
                CalendarEmailReviewQueue.organization_id == ctx.organization_id,
            )
        )


# ---------------------------------------------------------------------------
# Rent receipts — E2E seed helper
# ---------------------------------------------------------------------------

class _SeedRentPaymentRequest(BaseModel):
    model_config = {"extra": "forbid"}

    tenant_legal_name: str
    tenant_email: str
    amount_cents: int
    payer_name: str | None = None
    contract_start: str | None = None
    contract_end: str | None = None


class _SeedRentPaymentResponse(BaseModel):
    applicant_id: uuid.UUID
    inquiry_id: uuid.UUID
    signed_lease_id: uuid.UUID
    transaction_id: uuid.UUID


@router.post(
    "/test/seed-rent-payment-attributed",
    response_model=_SeedRentPaymentResponse,
    status_code=201,
)
async def seed_rent_payment_attributed(
    payload: _SeedRentPaymentRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedRentPaymentResponse:
    """Test-only: create a fully attributed rent payment fixture.

    Creates:
    - An Inquiry (provides the tenant email)
    - An Applicant at ``lease_signed`` stage linked to that inquiry
    - A SignedLease linked to the applicant
    - A Transaction (category=rental_revenue, attribution_source=auto_exact,
      applicant_id set)
    - A PendingRentReceipt row via ``receipt_service.create_pending_receipt_from_attribution``

    Returns IDs so the test can target specific rows and clean up afterwards.
    Gated by ``ALLOW_TEST_ADMIN_PROMOTION``.
    """
    _require_test_mode()

    amount = Decimal(payload.amount_cents) / 100
    now = _dt.datetime.now(_dt.timezone.utc)
    today = now.date()

    async with unit_of_work() as db:
        # 1. Inquiry — provides tenant email for the receipt service lookup.
        created_inquiry = await inquiry_repo.create(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            source="direct",
            received_at=now,
            inquirer_name=payload.tenant_legal_name,
            inquirer_email=payload.tenant_email,
        )

        # 2. Applicant linked to the inquiry.
        applicant = await applicant_repo.create(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            inquiry_id=created_inquiry.id,
            legal_name=payload.tenant_legal_name,
            stage="lease_signed",
        )

        # 3. Signed lease linked to the applicant.
        _contract_start = (
            _dt.date.fromisoformat(payload.contract_start) if payload.contract_start else today
        )
        _contract_end = (
            _dt.date.fromisoformat(payload.contract_end)
            if payload.contract_end
            else today.replace(month=12, day=31) if today.month <= 12 else today
        )
        lease = SignedLease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            applicant_id=applicant.id,
            listing_id=None,
            kind="imported",
            values={},
            status="signed",
            signed_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(lease)
        await db.flush()

        # 4. Transaction — attributed to the applicant.
        txn = await transaction_repo.create_transaction(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            is_manual=True,
            transaction_date=today,
            tax_year=today.year,
            vendor=payload.payer_name or payload.tenant_legal_name,
            payer_name=payload.payer_name or payload.tenant_legal_name,
            amount=amount,
            transaction_type="income",
            category="rental_revenue",
            applicant_id=applicant.id,
            attribution_source="auto_exact",
            status="approved",
        )

        applicant_id = applicant.id
        inquiry_id = created_inquiry.id
        signed_lease_id = lease.id
        transaction_id = txn.id

    # 5. Create the pending receipt row (calls the real service — idempotent).
    await receipt_service.create_pending_receipt_from_attribution(
        transaction_id=transaction_id,
        applicant_id=applicant_id,
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
    )

    return _SeedRentPaymentResponse(
        applicant_id=applicant_id,
        inquiry_id=inquiry_id,
        signed_lease_id=signed_lease_id,
        transaction_id=transaction_id,
    )


# ---------------------------------------------------------------------------
# Attribution review queue (Airbnb-payout rows) — E2E seed + cleanup helpers
# ---------------------------------------------------------------------------

class _SeedAttributionReviewRequest(BaseModel):
    model_config = {"extra": "forbid"}

    # ``None`` seeds a rent (tenant-shaped) row; an OTA channel string
    # seeds a property-shaped payout row. Constrained to the same domain as
    # the transactions.channel CHECK constraint so a bad value is a clean
    # 422, not a DB IntegrityError.
    channel: Literal["airbnb", "vrbo", "booking.com", "direct"] | None = "airbnb"
    amount: Decimal = Decimal("920.00")
    transaction_date: _dt.date | None = None
    description: str | None = None
    confidence: Literal["fuzzy", "unmatched"] = "unmatched"
    proposed_property_id: uuid.UUID | None = None


class _SeedAttributionReviewResponse(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID


@router.post(
    "/test/seed-attribution-review",
    response_model=_SeedAttributionReviewResponse,
    status_code=201,
)
async def seed_attribution_review(
    payload: _SeedAttributionReviewRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedAttributionReviewResponse:
    """Test-only: create a pending Airbnb-payout attribution-review row.

    Production rows land here from the email-extraction → ``attribution_service``
    pipeline; this seed bypasses Gmail + Claude so ``attribution-review.spec.ts``
    can exercise the full review-UX → confirm → ``transactions.property_id``
    flow deterministically. Gated by ``ALLOW_TEST_ADMIN_PROMOTION``.
    """
    _require_test_mode()
    txn_date = payload.transaction_date or _dt.datetime.now(_dt.timezone.utc).date()
    async with unit_of_work() as db:
        if payload.proposed_property_id is not None:
            prop = await property_repo.get_by_id(
                db, payload.proposed_property_id, ctx.organization_id
            )
            if prop is None:
                raise HTTPException(status_code=404, detail="Property not found")
        txn = await transaction_repo.create_transaction(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            is_manual=True,
            transaction_date=txn_date,
            tax_year=txn_date.year,
            amount=payload.amount,
            transaction_type="income",
            category="rental_revenue",
            channel=payload.channel,
            description=payload.description,
            status="approved",
        )
        row = await attribution_repo.create(
            db,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            transaction_id=txn.id,
            proposed_applicant_id=None,
            confidence=payload.confidence,
            proposed_property_id=payload.proposed_property_id,
        )
        return _SeedAttributionReviewResponse(id=row.id, transaction_id=txn.id)


@router.delete("/test/attribution-review/{review_id}", status_code=204)
async def hard_delete_attribution_review(
    review_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete an attribution-review row and its seeded transaction.

    Deleting the transaction cascades the review row (FK ON DELETE CASCADE),
    but a confirmed/rejected row may already be resolved — delete both
    explicitly, org-scoped, so no E2E artifact survives per
    ``feedback_clean_test_data``. Test-only.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        result = await db.execute(
            _sa_select(RentAttributionReviewQueue.transaction_id).where(
                RentAttributionReviewQueue.id == review_id,
                RentAttributionReviewQueue.organization_id == ctx.organization_id,
            )
        )
        transaction_id = result.scalar_one_or_none()
        await db.execute(
            _sa_delete(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.id == review_id,
                RentAttributionReviewQueue.organization_id == ctx.organization_id,
            )
        )
        if transaction_id is not None:
            await db.execute(
                _sa_delete(Transaction).where(
                    Transaction.id == transaction_id,
                    Transaction.organization_id == ctx.organization_id,
                )
            )
