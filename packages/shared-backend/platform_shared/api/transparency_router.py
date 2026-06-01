"""Shared transparency router factory — public endpoints, no auth.

Each app mounts this with ``app.include_router(build_transparency_router(settings))``.
Both routes are PUBLIC (the ``/support`` page is unauthenticated) and use
resource-level paths — host Caddy strips the ``/api`` prefix and FastAPI's
``root_path`` records it, so the router itself carries no ``/api`` (matching
the rest of the platform's routers):

    GET  /transparency             — public, cached-by-CDN-friendly read of
                                     this month's costs vs donations. Always
                                     200 with the TransparencyResponse shape;
                                     ``configured=false`` tells the widget to
                                     hide itself.
    POST /donations/kofi-webhook   — Ko-fi donation webhook receiver. Only the
                                     primary app has a verification token, and
                                     Ko-fi targets exactly one URL, so only the
                                     primary ever processes one.

Read-path error mapping mirrors the widget's three states: unconfigured
storage (dev / pre-setup) → 200 ``configured=false`` (hide); transient /
corrupt → 503 (widget shows "temporarily unavailable"); object missing →
200 ``configured=false``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from platform_shared.schemas.common import StatusResponse
from platform_shared.schemas.transparency import (
    TransparencyDocument,
    TransparencyResponse,
)
from platform_shared.services.transparency import kofi_service, transparency_store
from platform_shared.services.transparency.transparency_store import (
    S3Error,
    StorageNotConfiguredError,
)

logger = logging.getLogger(__name__)


def build_transparency_router(settings: object) -> APIRouter:
    """Construct the public transparency router bound to ``settings``.

    Args:
        settings: The app's settings object — must expose the MinIO fields,
            ``transparency_shared_bucket``, and ``kofi_verification_token``
            (BaseAppSettings provides all of these). Closed over by the route
            handlers so platform_shared stays decoupled from any app's
            concrete Settings subclass.
    """
    router = APIRouter(tags=["transparency"])

    @router.get("/transparency", response_model=TransparencyResponse)
    async def get_transparency() -> TransparencyResponse:
        now = datetime.now(timezone.utc)
        try:
            document = transparency_store.load_document(settings)  # type: ignore[arg-type]
        except StorageNotConfiguredError:
            # MinIO unconfigured (local dev / before the operator sets it up).
            # Report "not configured" so the widget hides rather than erroring.
            return transparency_store.project_response(None, now)
        except (S3Error, ValidationError, ValueError) as exc:
            # Present-but-unreadable (transient outage or corrupt object) is an
            # honest "temporarily unavailable" — don't masquerade it as "not
            # configured", which would silently hide a real backend problem.
            logger.warning("transparency read failed: %s", exc)
            raise HTTPException(
                status_code=503, detail="transparency_unavailable",
            ) from exc
        return transparency_store.project_response(document, now)

    @router.post("/donations/kofi-webhook", response_model=StatusResponse)
    async def kofi_webhook(request: Request) -> StatusResponse:
        raw = await request.body()
        payload_dict = kofi_service.parse_kofi_form_body(raw)
        if payload_dict is None:
            raise HTTPException(status_code=400, detail="invalid_webhook_body")
        payload = kofi_service.KofiPayload(payload_dict)

        expected = getattr(settings, "kofi_verification_token", "")
        if not expected:
            # Not the configured writer. Ko-fi targets exactly one URL, so this
            # is misrouted traffic against a permanently-wrong endpoint — return
            # 404 (not 503, which would make Ko-fi retry forever) so it stops.
            logger.warning(
                "Ko-fi webhook received but this app has no "
                "KOFI_VERIFICATION_TOKEN (not the transparency primary)",
            )
            raise HTTPException(
                status_code=404, detail="transparency_writer_not_configured",
            )

        if not kofi_service.verify_kofi_token(payload, expected_token=expected):
            logger.warning(
                "Ko-fi webhook verification_token mismatch: message_id=%s type=%s",
                payload.message_id,
                payload.type,
            )
            raise HTTPException(status_code=401, detail="invalid_verification_token")

        now = datetime.now(timezone.utc)
        try:
            document = transparency_store.load_document(settings) or TransparencyDocument()  # type: ignore[arg-type]
            newly_recorded = kofi_service.record_donation(document, payload, now)
            if newly_recorded:
                transparency_store.save_document(settings, document)  # type: ignore[arg-type]
        except (StorageNotConfiguredError, S3Error, ValidationError, ValueError) as exc:
            # Surface a 500 so Ko-fi retries — never silently drop a donation.
            logger.error("Ko-fi webhook storage failure: %s", exc)
            raise HTTPException(
                status_code=500, detail="transparency_store_error",
            ) from exc

        return StatusResponse(status="ok" if newly_recorded else "duplicate")

    return router


__all__ = ["build_transparency_router"]
