"""A user's TOTP secret and recovery codes reach audit_logs only as the mask.

Drives the audit listener with MBK's AUDIT_CONFIG (the configuration the
lifespan attaches — see test_audit_registration.py) through a real session
write, the same column writes TOTP enrollment makes.
"""
from __future__ import annotations

import pytest
from platform_shared.core.audit_erasure_constants import MASKED_AUDIT_VALUE
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.services.totp_service import encrypt_for_user
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user.user import User

_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
_RECOVERY_CODES = '["aaaa-bbbb", "cccc-dddd"]'


@pytest.mark.asyncio
async def test_totp_secret_update_is_masked_in_audit_log(
    db: AsyncSession, test_user: User, audit_listeners: None,
) -> None:
    ciphertext = encrypt_for_user(_SECRET, settings.encryption_key, test_user.id)
    user = await db.get(User, test_user.id)
    assert user is not None
    user.totp_secret = ciphertext
    user.totp_recovery_codes = _RECOVERY_CODES
    await db.flush()
    await db.flush()

    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "users",
            AuditLog.record_id == str(test_user.id),
            AuditLog.operation == "UPDATE",
        ),
    )).scalars().all()
    by_field = {r.field_name: r for r in rows}

    assert by_field["totp_secret"].new_value == MASKED_AUDIT_VALUE
    assert by_field["totp_recovery_codes"].new_value == MASKED_AUDIT_VALUE
    for row in rows:
        for value in (row.old_value, row.new_value):
            assert _SECRET not in (value or "")
            assert ciphertext not in (value or "")
            assert "aaaa-bbbb" not in (value or "")
