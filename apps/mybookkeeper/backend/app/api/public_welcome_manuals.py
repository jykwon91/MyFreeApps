"""Public, unauthenticated routes for the guest welcome-manual share link
(PIN-protected).

Exposes:
- ``GET /public/welcome-manuals/{token}`` — gate check. Returns
  ``{"requires_pin": true}`` and NOTHING else if the token resolves to an
  active share; 404 for unknown/revoked tokens (indistinguishable).
- ``POST /public/welcome-manuals/{token}/unlock`` — verifies the PIN (in the
  body, never the URL) and returns the guest-safe manual projection.

Mirrors ``public_inquiries.py``'s registration style: no ``/api`` prefix
(Caddy / the Vite dev proxy strip ``/api`` before requests reach FastAPI —
see the detailed comment in that module), and no ``current_org_member`` /
auth dependency. Defense-in-depth is the PIN itself plus the per-manual
unlock lockout in ``welcome_manual_share_service``.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.rate_limit import RateLimiter
from app.core.request_utils import get_client_ip
from app.schemas.welcome_manuals.public_welcome_manual_response import (
    PublicWelcomeManualResponse,
)
from app.schemas.welcome_manuals.welcome_manual_share_gate_response import (
    WelcomeManualShareGateResponse,
)
from app.schemas.welcome_manuals.welcome_manual_unlock_request import (
    WelcomeManualUnlockRequest,
)
from app.services.welcome_manuals import welcome_manual_share_service

# Per-IP cap on PIN attempts. The per-manual lockout stops guessing one guide;
# this stops one client sweeping many guides or racing the lockout.
welcome_manual_unlock_limiter = RateLimiter(
    max_attempts=settings.welcome_manual_unlock_rate_limit_max,
    window_seconds=settings.welcome_manual_unlock_rate_limit_window_seconds,
)

router = APIRouter(prefix="/public/welcome-manuals", tags=["public-welcome-manuals"])


@router.get("/{token}", response_model=WelcomeManualShareGateResponse)
async def get_share_gate(token: str) -> WelcomeManualShareGateResponse:
    """Existence check only. 404 for unknown/revoked tokens — never leaks
    the manual's title or any content before the PIN is verified."""
    exists = await welcome_manual_share_service.get_public_gate(token)
    if not exists:
        raise HTTPException(status_code=404, detail="Guide not found")
    return WelcomeManualShareGateResponse()


@router.post("/{token}/unlock", response_model=PublicWelcomeManualResponse)
async def unlock_share(
    token: str,
    payload: WelcomeManualUnlockRequest,
    request: Request,
) -> PublicWelcomeManualResponse:
    """Verify the PIN and, on success, return the guest-safe manual
    projection. Brute-force lockout is per-manual (persisted on the row),
    plus a per-IP rate limit — see ``welcome_manual_share_service.unlock_public``.
    A locked manual surfaces as the service's ``HTTPException(429)``, which
    propagates unchanged."""
    welcome_manual_unlock_limiter.check(get_client_ip(request) or "unknown")
    try:
        return await welcome_manual_share_service.unlock_public(token, payload.pin)
    except welcome_manual_share_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Guide not found") from exc
    except welcome_manual_share_service.IncorrectPinError as exc:
        raise HTTPException(status_code=401, detail="incorrect_pin") from exc
