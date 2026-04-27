import datetime as _dt
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.config import settings
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.user.user import Role, User
from app.repositories import (
    inquiry_repo,
    integration_repo,
    listing_repo,
)
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
