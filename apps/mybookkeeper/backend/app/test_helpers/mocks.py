"""Test-only mock-control endpoints: Gmail send stub, storage stub, reauth state."""

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import storage as _storage_module
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories import integration_repo
from app.services.email import gmail_service
from app.test_helpers.auth import _require_test_mode

router = APIRouter()

# Process-local ring buffer for capturing gmail send-with-attachment calls.
# Populated by the mock stub installed via POST /test/mock-gmail-send/enable.
# Cleared on each enable call so tests start with a clean capture window.
_last_gmail_attachment_send: dict[str, object] | None = None


@router.post("/test/mock-gmail-send/enable", status_code=204)
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


@router.post("/test/mock-gmail-send/disable", status_code=204)
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

    real_storage = getattr(_storage_module, "_real_get_storage", None)
    if real_storage is not None:
        _storage_module.get_storage = real_storage  # type: ignore[assignment]
        _storage_module._real_get_storage = None  # type: ignore[attr-defined]


class _LastGmailSendResponse(BaseModel):
    captured: bool
    to_address: str | None = None
    subject: str | None = None
    has_attachment: bool = False
    attachment_filename: str | None = None


@router.get("/test/last-gmail-send", response_model=_LastGmailSendResponse)
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


@router.post("/test/seed-integration-reauth-state", status_code=204)
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
