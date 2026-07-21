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

from fastapi import APIRouter, HTTPException

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
) -> PublicWelcomeManualResponse:
    """Verify the PIN and, on success, return the guest-safe manual
    projection. Brute-force lockout is per-manual (persisted on the row),
    not per client IP — see ``welcome_manual_share_service.unlock_public``.
    A locked manual surfaces as the service's ``HTTPException(429)``, which
    propagates unchanged."""
    try:
        return await welcome_manual_share_service.unlock_public(token, payload.pin)
    except welcome_manual_share_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Guide not found") from exc
    except welcome_manual_share_service.IncorrectPinError as exc:
        raise HTTPException(status_code=401, detail="incorrect_pin") from exc
