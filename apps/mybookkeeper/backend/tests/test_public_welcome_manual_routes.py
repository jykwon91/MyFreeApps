"""HTTP route tests for the public, unauthenticated welcome-manual share link.

Mirrors test_public_inquiries_api.py's style: mocks the service layer for
status-code/shape contract tests, plus one end-to-end-ish test through the
real service (patched DB session) to exercise the actual lockout + guest-safe
projection.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import SHARE_UNLOCK_MAX_ATTEMPTS
from app.main import app
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo
from app.schemas.welcome_manuals.public_welcome_manual_response import (
    PublicWelcomeManualResponse,
)
from app.services.welcome_manuals import welcome_manual_share_service


def patch_share_service(name: str, **kwargs):
    return patch.object(welcome_manual_share_service, name, **kwargs)


class TestGate:
    def test_shared_manual_returns_requires_pin_only(self) -> None:
        with patch_share_service("get_public_gate", return_value=True):
            client = TestClient(app)
            response = client.get("/public/welcome-manuals/some-token")
        assert response.status_code == 200
        assert response.json() == {"requires_pin": True}

    def test_unknown_token_404(self) -> None:
        with patch_share_service("get_public_gate", return_value=False):
            client = TestClient(app)
            response = client.get("/public/welcome-manuals/unknown-token")
        assert response.status_code == 404


class TestUnlock:
    def test_correct_pin_returns_manual(self) -> None:
        fake = PublicWelcomeManualResponse(title="Cabin Guide", sections=[], places=[])
        with patch_share_service("unlock_public", return_value=fake):
            client = TestClient(app)
            response = client.post(
                "/public/welcome-manuals/some-token/unlock", json={"pin": "1234"},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "Cabin Guide"
        assert "organization_id" not in body
        assert "share_token" not in body
        assert "share_pin" not in body

    def test_wrong_pin_401(self) -> None:
        with patch_share_service(
            "unlock_public",
            side_effect=welcome_manual_share_service.IncorrectPinError("nope"),
        ):
            client = TestClient(app)
            response = client.post(
                "/public/welcome-manuals/some-token/unlock", json={"pin": "0000"},
            )
        assert response.status_code == 401
        assert response.json() == {"detail": "incorrect_pin"}

    def test_unknown_token_404(self) -> None:
        with patch_share_service(
            "unlock_public",
            side_effect=welcome_manual_share_service.ManualNotFoundError("nope"),
        ):
            client = TestClient(app)
            response = client.post(
                "/public/welcome-manuals/unknown-token/unlock", json={"pin": "0000"},
            )
        assert response.status_code == 404

    def test_pin_not_in_query_string(self) -> None:
        """The PIN must travel in the body — a query-string variant is not a
        registered route at all (422/404, never processed as the PIN)."""
        client = TestClient(app)
        response = client.post(
            "/public/welcome-manuals/some-token/unlock?pin=1234", json={},
        )
        # Missing required body field -> 422 (proves query string is ignored).
        assert response.status_code == 422


class TestUnlockEndToEnd:
    """Real service, real (in-memory) DB, real RateLimiter — exercises the
    actual lockout behavior through the HTTP layer."""

    @staticmethod
    def _patch_db(db: AsyncSession):
        @asynccontextmanager
        async def _fake():
            yield db

        return patch.multiple(
            "app.services.welcome_manuals.welcome_manual_share_service",
            AsyncSessionLocal=_fake,
            unit_of_work=_fake,
        )

    @pytest.mark.asyncio
    async def test_lockout_returns_429_over_http(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await welcome_manual_repo.create_manual(
            db, organization_id=test_org.id, user_id=test_user.id,
            property_id=None, title="Cabin Guide", intro_text=None,
        )
        await db.commit()

        with self._patch_db(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()

            wrong = "0000" if enabled.share_pin != "0000" else "1111"
            client = TestClient(app)
            for _ in range(SHARE_UNLOCK_MAX_ATTEMPTS):
                r = client.post(
                    f"/public/welcome-manuals/{enabled.share_token}/unlock",
                    json={"pin": wrong},
                )
                assert r.status_code == 401

            locked = client.post(
                f"/public/welcome-manuals/{enabled.share_token}/unlock",
                json={"pin": enabled.share_pin},
            )
        assert locked.status_code == 429

    @pytest.mark.asyncio
    async def test_lockout_not_escapable_by_rotating_xforwarded_for(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Regression for the spoofable-lockout finding: the lockout is keyed
        on the manual (persisted on the row), NOT on the client IP. An
        attacker rotating ``X-Forwarded-For`` (which Caddy appends, so it's
        guest-controlled) must NOT earn a fresh attempt budget."""
        manual = await welcome_manual_repo.create_manual(
            db, organization_id=test_org.id, user_id=test_user.id,
            property_id=None, title="Cabin Guide", intro_text=None,
        )
        await db.commit()

        with self._patch_db(db):
            enabled = await welcome_manual_share_service.enable_share(
                test_org.id, test_user.id, manual.id,
            )
            await db.commit()

            wrong = "0000" if enabled.share_pin != "0000" else "1111"
            client = TestClient(app)
            # Exhaust the budget, each request from a DIFFERENT spoofed IP.
            for i in range(SHARE_UNLOCK_MAX_ATTEMPTS):
                r = client.post(
                    f"/public/welcome-manuals/{enabled.share_token}/unlock",
                    json={"pin": wrong},
                    headers={"X-Forwarded-For": f"9.9.9.{i}"},
                )
                assert r.status_code == 401

            # A brand-new spoofed IP does not reset the budget — still locked.
            locked = client.post(
                f"/public/welcome-manuals/{enabled.share_token}/unlock",
                json={"pin": enabled.share_pin},
                headers={"X-Forwarded-For": "203.0.113.7"},
            )
        assert locked.status_code == 429
