"""Repository tests for welcome_manual_send_repo.

Covers: create + list_by_manual ordering (newest first), encryption round-trip
(recipient PII reads back as plaintext but is stored as ciphertext), key_version
default, and tenant scoping (sends are reachable only through their manual).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.repositories.welcome_manuals import welcome_manual_send_repo


@pytest.fixture()
async def manual(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> WelcomeManual:
    m = WelcomeManual(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        user_id=test_user.id,
        title="Beach House Guide",
    )
    db.add(m)
    await db.commit()
    return m


class TestCreateAndList:
    @pytest.mark.asyncio
    async def test_create_returns_row(
        self, db: AsyncSession, manual: WelcomeManual,
    ) -> None:
        send = await welcome_manual_send_repo.create(
            db,
            manual_id=manual.id,
            recipient_email="guest@example.com",
            recipient_name="Jane Guest",
            status="sent",
        )
        await db.commit()
        assert send.id is not None
        assert send.manual_id == manual.id
        assert send.status == "sent"
        assert send.error_reason is None

    @pytest.mark.asyncio
    async def test_list_by_manual_newest_first(
        self, db: AsyncSession, manual: WelcomeManual,
    ) -> None:
        import datetime as _dt

        s1 = await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email="a@example.com",
            recipient_name=None, status="sent",
        )
        s1.created_at = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
        s2 = await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email="b@example.com",
            recipient_name=None, status="failed", error_reason="send_failed",
        )
        s2.created_at = _dt.datetime(2026, 2, 1, tzinfo=_dt.timezone.utc)
        await db.commit()

        rows = await welcome_manual_send_repo.list_by_manual(db, manual.id)
        assert [r.id for r in rows] == [s2.id, s1.id]

    @pytest.mark.asyncio
    async def test_key_version_defaults_to_one(
        self, db: AsyncSession, manual: WelcomeManual,
    ) -> None:
        send = await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email="g@example.com",
            recipient_name=None, status="skipped", error_reason="smtp_not_configured",
        )
        await db.commit()
        await db.refresh(send)
        assert send.key_version == 1


class TestEncryption:
    @pytest.mark.asyncio
    async def test_recipient_email_round_trips_and_is_ciphertext_at_rest(
        self, db: AsyncSession, manual: WelcomeManual,
    ) -> None:
        plaintext = "secret.guest@example.com"
        send = await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email=plaintext,
            recipient_name=None, status="sent",
        )
        await db.commit()
        await db.refresh(send)
        # ORM read returns plaintext.
        assert send.recipient_email == plaintext

        # Raw column read returns Fernet ciphertext, NOT the plaintext. Only one
        # row exists in this test's fresh in-memory DB, so no WHERE is needed
        # (mirrors test_applicant_encryption — avoids UUID bind-type mismatch on
        # SQLite).
        raw = await db.execute(text("SELECT recipient_email FROM welcome_manual_sends"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored
        assert stored.startswith("gAAAAA")

    @pytest.mark.asyncio
    async def test_recipient_name_round_trips_and_is_ciphertext_at_rest(
        self, db: AsyncSession, manual: WelcomeManual,
    ) -> None:
        plaintext = "Jane Q Guest"
        send = await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email="g@example.com",
            recipient_name=plaintext, status="sent",
        )
        await db.commit()
        await db.refresh(send)
        assert send.recipient_name == plaintext

        raw = await db.execute(text("SELECT recipient_name FROM welcome_manual_sends"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored
        assert stored.startswith("gAAAAA")


class TestTenantScoping:
    @pytest.mark.asyncio
    async def test_list_only_returns_sends_for_the_given_manual(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        manual: WelcomeManual,
    ) -> None:
        other = WelcomeManual(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            title="Other Guide",
        )
        db.add(other)
        await db.flush()

        await welcome_manual_send_repo.create(
            db, manual_id=manual.id, recipient_email="mine@example.com",
            recipient_name=None, status="sent",
        )
        await welcome_manual_send_repo.create(
            db, manual_id=other.id, recipient_email="theirs@example.com",
            recipient_name=None, status="sent",
        )
        await db.commit()

        rows = await welcome_manual_send_repo.list_by_manual(db, manual.id)
        assert len(rows) == 1
        assert rows[0].recipient_email == "mine@example.com"
