"""Verify the audit listener masks the welcome-manual send-log PII columns.

``recipient_email`` / ``recipient_name`` are encrypted at rest, but the audit
listener captures values BEFORE the bind-time encryption hook fires — so
without an entry in MBK_SENSITIVE_FIELDS the plaintext would leak into
audit_logs. This asserts both columns are masked as ``***``.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import register_audit_listeners
from app.models.organization.organization import Organization
from app.models.system.audit_log import AuditLog
from app.models.user.user import User
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_send import WelcomeManualSend


@pytest.fixture(autouse=True)
def _audit():
    register_audit_listeners()


class TestWelcomeManualSendAuditMasking:
    @pytest.mark.asyncio
    async def test_recipient_pii_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = WelcomeManual(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            title="Guide",
        )
        db.add(manual)
        await db.flush()

        plaintext_email = "guest.secret@example.com"
        plaintext_name = "Jane Q Guest"
        send = WelcomeManualSend(
            id=uuid.uuid4(),
            manual_id=manual.id,
            recipient_email=plaintext_email,
            recipient_name=plaintext_name,
            status="sent",
        )
        db.add(send)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "welcome_manual_sends",
                AuditLog.record_id == str(send.id),
                AuditLog.operation == "INSERT",
            ),
        )).scalars().all()

        masked = {r.field_name: r.new_value for r in rows}
        assert masked.get("recipient_email") == "***"
        assert masked.get("recipient_name") == "***"
        # Non-sensitive columns are still captured.
        assert masked.get("status") == "sent"
        # Plaintext PII never leaks into ANY audit row.
        for r in rows:
            if r.new_value is not None:
                assert plaintext_email not in r.new_value
                assert plaintext_name not in r.new_value
