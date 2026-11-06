"""Test-only Gmail integration seed, so E2E reply and receipt flows run without Google's OAuth.

Lives beside ``seed.py`` rather than inside it: that module is past the
1000-LOC guard.
"""

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories import integration_repo
from app.repositories.inquiries import inquiry_reply_send_repo, inquiry_repo
from app.repositories.leases import pending_rent_receipt_repo
from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER
from app.services.integrations import integration_service
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedGmailRequest(BaseModel):
    has_send_scope: bool = True
    gmail_address: str = "e2e-host@example.com"


class _SeedStuckReceiptSendRequest(BaseModel):
    transaction_id: uuid.UUID
    sender_gmail_address: str


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
            gmail_address=payload.gmail_address,
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


@router.post("/test/seed-receipt-stuck-send", status_code=204)
async def seed_receipt_stuck_send(
    payload: _SeedStuckReceiptSendRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Leave a pending receipt claimed through ``sender_gmail_address`` long
    enough ago to settle, as if Gmail never confirmed that send.
    """
    _require_test_mode()
    claimed_at = _dt.datetime.now(_dt.timezone.utc) - GMAIL_SEND_CLAIM_STALE_AFTER - _dt.timedelta(minutes=1)
    async with unit_of_work() as db:
        claimed = await pending_rent_receipt_repo.claim_for_send(
            db,
            transaction_id=payload.transaction_id,
            organization_id=ctx.organization_id,
            send_message_id=f"<e2e-{uuid.uuid4()}@mybookkeeper>",
            sender_gmail_address=payload.sender_gmail_address,
            claimed_at=claimed_at,
        )
    if claimed is None:
        raise HTTPException(status_code=404, detail="No pending receipt for that transaction")


@router.post("/test/inquiries/{inquiry_id}/age-reply-sends", status_code=204)
async def age_reply_sends(
    inquiry_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Make an inquiry's unconfirmed reply sends old enough to settle, so a
    retry checks Gmail instead of waiting out the stale window.
    """
    _require_test_mode()
    claimed_at = _dt.datetime.now(_dt.timezone.utc) - GMAIL_SEND_CLAIM_STALE_AFTER - _dt.timedelta(minutes=1)
    async with unit_of_work() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, ctx.organization_id)
        if inquiry is None:
            raise HTTPException(status_code=404, detail="Inquiry not found")
        await inquiry_reply_send_repo.backdate_open_claims(db, inquiry_id=inquiry_id, claimed_at=claimed_at)
