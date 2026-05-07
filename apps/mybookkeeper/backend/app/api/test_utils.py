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
    """Replace ``gmail_service.send_message`` and ``send_message_with_attachment``
    with stubs that return a fake message-id. Used by E2E so tests don't hit
    the Gmail API.

    The attachment stub also captures send-call kwargs in the process-local
    ``_last_gmail_attachment_send`` ring buffer so tests can assert recipient
    and subject via ``GET /test/last-gmail-send``.

    The patch lives at module level — the next send call sees the stub.
    ``disable`` restores the originals.
    """
    _require_test_mode()
    global _last_gmail_attachment_send
    _last_gmail_attachment_send = None  # clear capture window on each enable

    if getattr(gmail_service, "_real_send_message", None) is None:
        gmail_service._real_send_message = gmail_service.send_message  # type: ignore[attr-defined]

    def _stub(*args: object, **kwargs: object) -> str:
        return f"<e2e-mock-{uuid.uuid4().hex[:12]}@mybookkeeper.app>"

    gmail_service.send_message = _stub  # type: ignore[assignment]

    if getattr(gmail_service, "_real_send_message_with_attachment", None) is None:
        gmail_service._real_send_message_with_attachment = gmail_service.send_message_with_attachment  # type: ignore[attr-defined]

    def _attachment_stub(*args: object, **kwargs: object) -> str:
        global _last_gmail_attachment_send
        _last_gmail_attachment_send = {
            "to_address": kwargs.get("to_address"),
            "subject": kwargs.get("subject"),
            "attachment_filename": kwargs.get("attachment_filename"),
        }
        return f"<e2e-mock-att-{uuid.uuid4().hex[:12]}@mybookkeeper.app>"

    gmail_service.send_message_with_attachment = _attachment_stub  # type: ignore[assignment]

    # Also mock storage so receipt PDF upload succeeds without a real MinIO.
    from app.core import storage as _storage_module

    if getattr(_storage_module, "_real_get_storage", None) is None:
        _storage_module._real_get_storage = _storage_module.get_storage  # type: ignore[attr-defined]

    class _NoOpStorage:
        bucket = "mock-bucket"

        def upload_file(self, key: str, content: bytes, content_type: str) -> str:
            return key

        def delete_file(self, key: str) -> None:
            pass

        def ensure_bucket(self) -> None:
            pass

    _no_op = _NoOpStorage()

    def _storage_stub() -> _NoOpStorage:
        return _no_op

    _storage_module.get_storage = _storage_stub  # type: ignore[assignment]


@router.post("/mock-gmail-send/disable", status_code=204)
async def disable_mock_gmail_send(
    ctx: RequestContext = Depends(current_org_member),  # noqa: ARG001
) -> None:
    """Restore the real ``gmail_service.send_message`` and
    ``send_message_with_attachment`` after E2E."""
    _require_test_mode()
    real = getattr(gmail_service, "_real_send_message", None)
    if real is not None:
        gmail_service.send_message = real  # type: ignore[assignment]
        gmail_service._real_send_message = None  # type: ignore[attr-defined]

    real_att = getattr(gmail_service, "_real_send_message_with_attachment", None)
    if real_att is not None:
        gmail_service.send_message_with_attachment = real_att  # type: ignore[assignment]
        gmail_service._real_send_message_with_attachment = None  # type: ignore[attr-defined]

    from app.core import storage as _storage_module

    real_storage = getattr(_storage_module, "_real_get_storage", None)
    if real_storage is not None:
        _storage_module.get_storage = real_storage  # type: ignore[assignment]
        _storage_module._real_get_storage = None  # type: ignore[attr-defined]


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


@router.post("/seed-lease-template", response_model=_SeedLeaseTemplateResponse)
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
    from app.repositories.leases import (
        lease_template_file_repo,
        lease_template_placeholder_repo,
        lease_template_repo,
    )
    from app.services.leases.default_source_map import (
        get_default,
        guess_display_label,
    )
    from app.services.leases.placeholder_extractor import extract_placeholder_keys

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


@router.delete("/lease-templates/{template_id}", status_code=204)
async def hard_delete_lease_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a lease template (cascades files / placeholders). Test-only."""
    _require_test_mode()
    from app.models.leases.lease_template import LeaseTemplate
    from app.repositories.leases import lease_template_repo

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
    attachments: list[_SeedAttachmentSpec] = []


class _SeedSignedLeaseResponse(BaseModel):
    id: uuid.UUID
    attachment_ids: list[uuid.UUID] = []


@router.post("/seed-signed-lease", response_model=_SeedSignedLeaseResponse, status_code=201)
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
    from app.models.leases.signed_lease import SignedLease
    from app.models.leases.signed_lease_attachment import SignedLeaseAttachment

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


@router.delete("/signed-leases/{lease_id}", status_code=204)
async def hard_delete_signed_lease(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a signed lease (cascades attachments). Test-only."""
    _require_test_mode()
    from app.models.leases.signed_lease import SignedLease
    from app.repositories.leases import signed_lease_repo

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


@router.post("/seed-review-queue-item", response_model=_SeedReviewQueueResponse, status_code=201)
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
    from app.repositories.calendar import review_queue_repo

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
            from app.models.calendar.calendar_email_review_queue import (
                CalendarEmailReviewQueue,
            )
            from sqlalchemy import select as _sa_select
            result = await db.execute(
                _sa_select(CalendarEmailReviewQueue).where(
                    CalendarEmailReviewQueue.user_id == ctx.user_id,
                    CalendarEmailReviewQueue.email_message_id == payload.email_message_id,
                )
            )
            row = result.scalar_one()

    return _SeedReviewQueueResponse(id=row.id)


@router.delete("/review-queue/{item_id}", status_code=204)
async def hard_delete_review_queue_item(
    item_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a review-queue item for E2E cleanup. Test-only."""
    _require_test_mode()
    from app.models.calendar.calendar_email_review_queue import (
        CalendarEmailReviewQueue,
    )

    async with unit_of_work() as db:
        await db.execute(
            _sa_delete(CalendarEmailReviewQueue).where(
                CalendarEmailReviewQueue.id == item_id,
                CalendarEmailReviewQueue.organization_id == ctx.organization_id,
            )
        )


# ---------------------------------------------------------------------------
# Rent receipts — E2E seed + cleanup helpers
# ---------------------------------------------------------------------------

# Process-local ring buffer for capturing gmail send-with-attachment calls.
# Populated by the mock stub installed via POST /test/mock-gmail-send/enable.
# Cleared on each enable call so tests start with a clean capture window.
_last_gmail_attachment_send: dict[str, object] | None = None


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
    "/seed-rent-payment-attributed",
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

    from decimal import Decimal as _Decimal
    from app.models.leases.signed_lease import SignedLease
    from app.repositories.applicants import applicant_repo
    from app.repositories.inquiries import inquiry_repo
    from app.repositories.transactions import transaction_repo
    from app.services.leases import receipt_service

    amount = _Decimal(payload.amount_cents) / 100
    now = _dt.datetime.now(_dt.timezone.utc)
    today = now.date()

    async with unit_of_work() as db:
        # 1. Inquiry — provides tenant email for the receipt service lookup.
        inquiry = await inquiry_repo.create(
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
            inquiry_id=inquiry.id,
            legal_name=payload.tenant_legal_name,
            stage="lease_signed",
        )

        # 3. Signed lease linked to the applicant.
        contract_start = (
            _dt.date.fromisoformat(payload.contract_start) if payload.contract_start else today
        )
        contract_end = (
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
        inquiry_id = inquiry.id
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


class _LastGmailSendResponse(BaseModel):
    captured: bool
    to_address: str | None = None
    subject: str | None = None
    has_attachment: bool = False
    attachment_filename: str | None = None


@router.get("/last-gmail-send", response_model=_LastGmailSendResponse)
async def get_last_gmail_send(
    ctx: RequestContext = Depends(current_org_member),  # noqa: ARG001
) -> _LastGmailSendResponse:
    """Return the args of the most recent mock send_message_with_attachment call.

    Only populated when the mock stub is active (POST /test/mock-gmail-send/enable).
    Used by E2E tests to assert that a receipt email was dispatched with the
    correct recipient and attachment without hitting the real Gmail API.
    """
    _require_test_mode()
    captured = _last_gmail_attachment_send
    if captured is None:
        return _LastGmailSendResponse(captured=False)
    return _LastGmailSendResponse(
        captured=True,
        to_address=captured.get("to_address"),  # type: ignore[arg-type]
        subject=captured.get("subject"),  # type: ignore[arg-type]
        has_attachment="attachment_filename" in captured,
        attachment_filename=captured.get("attachment_filename"),  # type: ignore[arg-type]
    )


class _SeedNeedsReauthRequest(BaseModel):
    model_config = {"extra": "forbid"}

    needs_reauth: bool = True


@router.post("/seed-integration-reauth-state", status_code=204)
async def seed_integration_reauth_state(
    payload: _SeedNeedsReauthRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Set ``needs_reauth`` on the org's Gmail integration. Test-only.

    Used by E2E Test C to verify the dialog surfaces the reconnect-required
    state rather than a generic error when Gmail tokens are expired.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        integration = await integration_repo.get_by_org_and_provider(
            db, ctx.organization_id, "gmail",
        )
        if integration is None:
            raise HTTPException(status_code=404, detail="No Gmail integration found")
        now = _dt.datetime.now(_dt.timezone.utc)
        if payload.needs_reauth:
            await integration_repo.mark_needs_reauth(
                db, integration, "e2e-test-forced-reauth", now,
            )
        else:
            await integration_repo.clear_reauth_state(db, integration)
