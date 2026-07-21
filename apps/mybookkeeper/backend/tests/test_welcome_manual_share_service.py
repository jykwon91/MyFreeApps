"""Service-layer tests for welcome_manual_share_service.

Patches ``AsyncSessionLocal`` + ``unit_of_work`` on the service module to
point at the in-memory SQLite session (same pattern as
test_welcome_manual_service.py) so the ``EncryptedString`` round-trip and the
real per-manual DB lockout logic are exercised end-to-end.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import SHARE_UNLOCK_MAX_ATTEMPTS
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import (
    welcome_manual_place_repo,
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_repo,
)
from app.services.welcome_manuals import welcome_manual_share_service


def _patch(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch.multiple(
        "app.services.welcome_manuals.welcome_manual_share_service",
        AsyncSessionLocal=_fake,
        unit_of_work=_fake,
    )


def _wrong_pin(correct: str) -> str:
    """A 4-digit PIN guaranteed to differ from ``correct`` (avoids the
    ~1-in-10000 flake risk of a hardcoded guess colliding with the randomly
    generated real PIN)."""
    return "0000" if correct != "0000" else "1111"


async def _make_manual(db: AsyncSession, org: Organization, user: User, *, title: str = "Cabin Guide"):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title=title, intro_text="Welcome!",
    )
    await db.flush()
    return manual


class TestEnableShare:
    @pytest.mark.asyncio
    async def test_enable_returns_token_and_pin(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            resp = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
        assert resp.share_token
        assert resp.share_path == f"/guide/{resp.share_token}"
        assert resp.share_pin.isdigit()
        assert len(resp.share_pin) == 4

    @pytest.mark.asyncio
    async def test_enable_is_idempotent(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            first = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            second = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
        assert second.share_token == first.share_token
        assert second.share_pin == first.share_pin

    @pytest.mark.asyncio
    async def test_enable_missing_manual_raises(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.enable_share(
                    test_org.id, uuid.uuid4(), uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_enable_cross_org_raises(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.enable_share(
                    uuid.uuid4(), test_user.id, manual.id,
                )


class TestRotatePin:
    @pytest.mark.asyncio
    async def test_rotate_changes_pin_and_old_pin_then_fails(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            rotated = await welcome_manual_share_service.rotate_pin(
                test_org.id, test_user.id, manual.id, None,
            )
            await db.commit()
            assert rotated.share_token == enabled.share_token
            assert rotated.share_pin != enabled.share_pin

            # Old PIN no longer unlocks.
            with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                await welcome_manual_share_service.unlock_public(
                    rotated.share_token, enabled.share_pin,
                )
            # New PIN does.
            unlocked = await welcome_manual_share_service.unlock_public(
                rotated.share_token, rotated.share_pin,
            )
        assert unlocked.title == manual.title

    @pytest.mark.asyncio
    async def test_rotate_with_explicit_pin(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            rotated = await welcome_manual_share_service.rotate_pin(
                test_org.id, test_user.id, manual.id, "1234",
            )
        assert rotated.share_pin == "1234"

    @pytest.mark.asyncio
    async def test_rotate_not_shared_raises(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ShareNotEnabledError):
                await welcome_manual_share_service.rotate_pin(
                    test_org.id, test_user.id, manual.id, None,
                )

    @pytest.mark.asyncio
    async def test_rotate_missing_manual_raises(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.rotate_pin(
                    test_org.id, uuid.uuid4(), uuid.uuid4(), None,
                )


class TestRevoke:
    @pytest.mark.asyncio
    async def test_revoke_clears_token_and_pin_then_gate_and_unlock_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            await welcome_manual_share_service.revoke_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()

            assert await welcome_manual_share_service.get_public_gate(enabled.share_token) is False

            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.unlock_public(
                    enabled.share_token, enabled.share_pin,
                )

    @pytest.mark.asyncio
    async def test_revoke_missing_manual_raises(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.revoke_share(
                    test_org.id, uuid.uuid4(), uuid.uuid4(),
                )


class TestPublicGate:
    @pytest.mark.asyncio
    async def test_gate_true_for_shared_manual(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            assert await welcome_manual_share_service.get_public_gate(enabled.share_token) is True

    @pytest.mark.asyncio
    async def test_gate_false_for_unknown_token(self, db: AsyncSession) -> None:
        with _patch(db):
            assert await welcome_manual_share_service.get_public_gate("no-such-token") is False


class TestUnlockPublic:
    @pytest.mark.asyncio
    async def test_correct_pin_returns_sections_and_places(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="Wi-Fi", body="Connect to GuestNet", display_order=0,
        )
        await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="Password", value="hunter2", display_order=0,
        )
        await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="Taco Spot", cuisine="Mexican",
            price_tier="$$", note=None, map_url=None, display_order=0,
        )
        await db.commit()

        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            unlocked = await welcome_manual_share_service.unlock_public(
                enabled.share_token, enabled.share_pin,
            )

        assert unlocked.title == manual.title
        assert len(unlocked.sections) == 1
        assert unlocked.sections[0].title == "Wi-Fi"
        assert unlocked.sections[0].fields[0].label == "Password"
        assert unlocked.sections[0].fields[0].value == "hunter2"
        assert len(unlocked.places) == 1
        assert unlocked.places[0].name == "Taco Spot"

    @pytest.mark.asyncio
    async def test_security_no_sensitive_fields_leak(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The unlock success payload must never carry organization_id,
        share_token, share_pin, or any owner/user id/email."""
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            unlocked = await welcome_manual_share_service.unlock_public(
                enabled.share_token, enabled.share_pin,
            )
        dumped = unlocked.model_dump()
        forbidden = {
            "organization_id", "user_id", "owner_id", "email",
            "share_token", "share_pin", "id", "manual_id",
            "created_at", "updated_at", "deleted_at",
        }
        assert forbidden.isdisjoint(dumped.keys())
        for section in dumped["sections"]:
            assert forbidden.isdisjoint(section.keys())

    @pytest.mark.asyncio
    async def test_wrong_pin_raises_incorrect_pin(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                await welcome_manual_share_service.unlock_public(
                    enabled.share_token, _wrong_pin(enabled.share_pin),
                )

    @pytest.mark.asyncio
    async def test_unknown_token_raises_manual_not_found(self, db: AsyncSession) -> None:
        with _patch(db):
            with pytest.raises(welcome_manual_share_service.ManualNotFoundError):
                await welcome_manual_share_service.unlock_public(
                    "no-such-token", "0000",
                )

    @pytest.mark.asyncio
    async def test_lockout_after_max_attempts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()

            wrong = _wrong_pin(enabled.share_pin)
            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS):
                with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                    await welcome_manual_share_service.unlock_public(
                        enabled.share_token, wrong,
                    )

            # Cap reached — even the CORRECT pin is now rejected until the
            # lockout window elapses.
            with pytest.raises(HTTPException) as exc_info:
                await welcome_manual_share_service.unlock_public(
                    enabled.share_token, enabled.share_pin,
                )
            assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_lockout_is_scoped_per_manual_not_global(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The lockout is keyed on the manual (its share token), persisted on
        the row — so it can't be escaped by rotating the client IP / any
        request header (finding #1: a per-IP key was spoofable via
        ``X-Forwarded-For``), yet it also doesn't spill onto OTHER manuals.

        Lock manual A with wrong PINs; manual B (independent share) is still
        unlockable, and A stays locked regardless of who's asking."""
        manual_a = await _make_manual(db, test_org, test_user, title="Guide A")
        manual_b = await _make_manual(db, test_org, test_user, title="Guide B")
        await db.commit()
        with _patch(db):
            enabled_a = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual_a.id,
            )
            enabled_b = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual_b.id,
            )
            await db.commit()

            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS):
                with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                    await welcome_manual_share_service.unlock_public(
                        enabled_a.share_token, _wrong_pin(enabled_a.share_pin),
                    )

            # A is locked — correct PIN still 429 (spoofing IP can't help; the
            # key is the token, and there is no IP input anymore).
            with pytest.raises(HTTPException) as exc_info:
                await welcome_manual_share_service.unlock_public(
                    enabled_a.share_token, enabled_a.share_pin,
                )
            assert exc_info.value.status_code == 429

            # B is untouched by A's lockout.
            unlocked_b = await welcome_manual_share_service.unlock_public(
                enabled_b.share_token, enabled_b.share_pin,
            )
        assert unlocked_b.title == manual_b.title

    @pytest.mark.asyncio
    async def test_successful_unlocks_never_lock_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """A guest reopening the guide with the CORRECT PIN can never lock
        themselves out — successes don't count toward the cap (the failure-
        only-counting fix; v1 re-prompts on every refresh)."""
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()

            # Far more correct unlocks than the wrong-PIN cap — all succeed.
            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS + 3):
                unlocked = await welcome_manual_share_service.unlock_public(
                    enabled.share_token, enabled.share_pin,
                )
                assert unlocked.title == manual.title

    @pytest.mark.asyncio
    async def test_success_resets_failure_counter(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """A correct PIN resets the accumulated failure count, so a guest who
        fat-fingers the code a few times then gets it right starts fresh — the
        next run of wrong guesses has the full budget again, never a carried-
        over 429."""
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()
            wrong = _wrong_pin(enabled.share_pin)

            # One below the cap, then a correct unlock resets the counter.
            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS - 1):
                with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                    await welcome_manual_share_service.unlock_public(
                        enabled.share_token, wrong,
                    )
            reset = await welcome_manual_share_service.unlock_public(
                enabled.share_token, enabled.share_pin,
            )
            assert reset.title == manual.title

            # Budget is full again: another (cap - 1) wrong guesses are all
            # plain 401s, NOT a 429 — proving the counter reset to 0.
            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS - 1):
                with pytest.raises(welcome_manual_share_service.IncorrectPinError):
                    await welcome_manual_share_service.unlock_public(
                        enabled.share_token, wrong,
                    )
