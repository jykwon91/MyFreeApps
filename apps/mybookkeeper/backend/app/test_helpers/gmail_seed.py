"""Test-only Gmail integration seed, so E2E reply and receipt flows run without Google's OAuth.

Lives beside ``seed.py`` rather than inside it: that module is past the
1000-LOC guard.
"""

import datetime as _dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories import integration_repo
from app.services.integrations import integration_service
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


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
            gmail_address="e2e-host@example.com",
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
