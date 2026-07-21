"""Welcome-manual public share-link service.

Two audiences:
  * Owner-scoped (``enable_share`` / ``rotate_pin`` / ``revoke_share``) —
    org-scoped like every other welcome-manual service, re-verifies the
    manual belongs to the caller's organization before touching it.
  * Public/unauthenticated (``get_public_gate`` / ``unlock_public``) — no
    organization context; the share token IS the lookup key.

Security notes:
  * ``share_pin`` is stored via ``EncryptedString`` (reversible Fernet
    ciphertext), never a one-way hash — the host needs to view/copy the
    current PIN in their editor to re-share it.
  * Guest-submitted PINs are verified with ``hmac.compare_digest``
    (constant-time) so a timing side-channel can't narrow down correct
    digits one at a time.
  * Brute-force lockout is PER-MANUAL (keyed on the share token, persisted
    on the row as ``failed_unlock_count`` / ``unlock_locked_until``), NOT
    per-client-IP. A per-IP key would be bypassable: Caddy appends a
    guest-supplied ``X-Forwarded-For``, so an attacker rotating that header
    would earn a fresh attempt budget per spoofed value and could exhaust
    the 10,000-value PIN space. The DB counter can't be spoofed and survives
    worker restarts / multi-worker deployments (an in-memory limiter does
    neither). The counter is incremented ONLY on a wrong PIN and reset on
    any success — mirroring the platform account-lockout primitive
    (``users.failed_login_count`` is bumped only on a real password
    failure) — so a guest legitimately reopening the guide (v1 re-prompts on
    every refresh) can never self-lock with the correct code. While locked,
    even a correct PIN is rejected with 429, so there is no oracle.
  * The PIN itself is never logged.
"""
from __future__ import annotations

import hmac
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

from app.core.welcome_manual_constants import (
    SHARE_PIN_LENGTH,
    SHARE_TOKEN_BYTES,
    SHARE_UNLOCK_LOCKOUT_WINDOW_SECONDS,
    SHARE_UNLOCK_MAX_ATTEMPTS,
)
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.repositories import (
    welcome_manual_place_repo,
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.public_welcome_manual_place_response import (
    PublicWelcomeManualPlaceResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_response import (
    PublicWelcomeManualResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_section_field_response import (
    PublicWelcomeManualSectionFieldResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_section_image_response import (
    PublicWelcomeManualSectionImageResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_section_response import (
    PublicWelcomeManualSectionResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.schemas.welcome_manuals.welcome_manual_share_response import (
    WelcomeManualShareResponse,
)
from app.services.welcome_manuals.section_image_response_builder import (
    attach_presigned_urls,
)
from app.services.welcome_manuals.welcome_manual_section_service import (
    ManualNotFoundError,  # noqa: F401 — re-exported for the route
)


class ShareNotEnabledError(LookupError):
    """PATCH (rotate) was requested for a manual with no active share link."""


class IncorrectPinError(Exception):
    """The submitted PIN did not match (-> HTTP 401)."""


def _generate_pin() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(SHARE_PIN_LENGTH))


def _share_response(manual: WelcomeManual) -> WelcomeManualShareResponse:
    assert manual.share_token is not None and manual.share_pin is not None
    return WelcomeManualShareResponse(
        share_token=manual.share_token,
        share_path=f"/guide/{manual.share_token}",
        share_pin=manual.share_pin,
    )


async def enable_share(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
) -> WelcomeManualShareResponse:
    """Enable the public share link for a manual.

    Idempotent: a manual that's already shared returns its existing token +
    PIN unchanged rather than rotating them.

    Raises ManualNotFoundError: scope failure.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")

        if manual.share_token is not None:
            return _share_response(manual)

        token = secrets.token_urlsafe(SHARE_TOKEN_BYTES)
        pin = _generate_pin()
        manual = await welcome_manual_repo.set_share(
            db, manual_id, organization_id, share_token=token, share_pin=pin,
        )
        return _share_response(manual)


async def rotate_pin(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    pin: str | None,
) -> WelcomeManualShareResponse:
    """Rotate a shared manual's PIN.

    Uses ``pin`` if supplied (already digit/length-validated by the
    schema); otherwise generates a fresh random PIN.

    Raises:
        ManualNotFoundError: scope failure.
        ShareNotEnabledError: the manual is not currently shared.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        if manual.share_token is None:
            raise ShareNotEnabledError(f"Welcome manual {manual_id} is not shared")

        new_pin = pin if pin is not None else _generate_pin()
        manual = await welcome_manual_repo.rotate_pin(
            db, manual_id, organization_id, share_pin=new_pin,
        )
        return _share_response(manual)


async def revoke_share(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
) -> None:
    """Revoke the share link — clears both the token and PIN.

    Raises ManualNotFoundError: scope failure.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        await welcome_manual_repo.clear_share(db, manual_id, organization_id)


async def get_public_gate(token: str) -> bool:
    """True iff an active (non-revoked, non-deleted) share link exists for
    ``token``. Reveals nothing about the manual beyond existence — callers
    must not leak the title or any content before the PIN is verified.
    """
    async with AsyncSessionLocal() as db:
        manual = await welcome_manual_repo.get_by_share_token(db, token)
    return manual is not None and manual.share_pin is not None


async def _assemble_public_response(db, manual: WelcomeManual) -> PublicWelcomeManualResponse:
    sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
    section_ids = [s.id for s in sections]
    images = await welcome_manual_section_image_repo.list_by_section_ids(db, section_ids)
    fields = await welcome_manual_section_field_repo.list_by_section_ids(db, section_ids)
    places = await welcome_manual_place_repo.list_by_manual(db, manual.id)

    authed_images = [WelcomeManualSectionImageResponse.model_validate(img) for img in images]
    signed = attach_presigned_urls(authed_images)
    images_by_section: dict[uuid.UUID, list[PublicWelcomeManualSectionImageResponse]] = {}
    for image in signed:
        images_by_section.setdefault(image.section_id, []).append(
            PublicWelcomeManualSectionImageResponse(
                caption=image.caption,
                display_order=image.display_order,
                presigned_url=image.presigned_url,
                is_available=image.is_available,
            ),
        )

    fields_by_section: dict[uuid.UUID, list[PublicWelcomeManualSectionFieldResponse]] = {}
    for field in fields:
        fields_by_section.setdefault(field.section_id, []).append(
            PublicWelcomeManualSectionFieldResponse(label=field.label, value=field.value),
        )

    section_responses = [
        PublicWelcomeManualSectionResponse(
            title=s.title,
            body=s.body,
            fields=fields_by_section.get(s.id, []),
            images=images_by_section.get(s.id, []),
        )
        for s in sections
    ]
    place_responses = [PublicWelcomeManualPlaceResponse.model_validate(p) for p in places]

    return PublicWelcomeManualResponse(
        title=manual.title,
        sections=section_responses,
        places=place_responses,
    )


async def unlock_public(
    token: str,
    pin: str,
) -> PublicWelcomeManualResponse:
    """Verify a guest-submitted PIN and, on success, return the guest-safe
    manual projection.

    Brute-force lockout is per-manual (see the module docstring): the manual
    is locked once ``SHARE_UNLOCK_MAX_ATTEMPTS`` wrong PINs accumulate, and
    the counter resets on any success. Ordering mirrors the account-lockout
    dependency — the lock is checked BEFORE the PIN comparison, so a correct
    PIN submitted during an active lockout is still rejected with 429 (no
    oracle), and the failure counter is only ever bumped on a real mismatch.

    Raises:
        ManualNotFoundError: unknown token, or the manual's share was
            revoked (indistinguishable from unknown -> HTTP 404).
        IncorrectPinError: the PIN did not match (-> HTTP 401).
        fastapi.HTTPException(429): the manual is currently locked out.

    Never logs the submitted or stored PIN.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_share_token(db, token)
        if manual is None or manual.share_pin is None:
            raise ManualNotFoundError("Share token not found")

        now = datetime.now(timezone.utc)
        if manual.unlock_locked_until is not None and manual.unlock_locked_until > now:
            # Locked — reject before comparing, so a correct guess during the
            # lockout window is indistinguishable from a wrong one.
            raise HTTPException(status_code=429, detail=RATE_LIMIT_GENERIC_DETAIL)

        if hmac.compare_digest(pin, manual.share_pin):
            # Correct PIN — clear any accumulated failures so repeat visits
            # with the right code can never trip the lockout, then return the
            # projection (clean ``return`` commits the reset).
            await welcome_manual_repo.reset_unlock_state(db, manual)
            return await _assemble_public_response(db, manual)

        # Wrong PIN — record the failure and fall through so the transaction
        # COMMITS the increment. Raising here would let ``unit_of_work`` roll
        # back on the exception, discarding the increment and defeating the
        # lockout. The raise happens below, after the write is committed.
        await welcome_manual_repo.record_failed_unlock(
            db,
            manual,
            max_attempts=SHARE_UNLOCK_MAX_ATTEMPTS,
            lockout_window_seconds=SHARE_UNLOCK_LOCKOUT_WINDOW_SECONDS,
            now=now,
        )

    raise IncorrectPinError("Incorrect PIN")
