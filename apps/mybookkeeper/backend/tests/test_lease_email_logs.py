"""The tenant lease email logs the lease id and the address's domain, never the address."""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.leases import lease_email_service
from tests.lease_email_support import EMAIL, email_patches
from tests.lease_regenerate_support import (
    lease_with_rendered_attachment,
    real_uow,  # noqa: F401 — fixture
    storage_double,
)


@pytest.mark.asyncio
async def test_failed_and_sent_logs_carry_only_the_domain(
    db: AsyncSession,
    real_uow,  # noqa: F811 — the fixture imported above
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    monkeypatch.setattr(f"{EMAIL}.unit_of_work", real_uow)
    p = email_patches(storage_double(), AsyncMock(side_effect=[False, True]))
    args = dict(lease_id=lease.id, user_id=user_id, organization_id=org_id)

    with p[0], p[1], p[2], p[3], p[4], p[5], caplog.at_level(logging.INFO, logger=EMAIL):
        assert await lease_email_service.send_lease_to_tenant(**args) is False
        assert await lease_email_service.send_lease_to_tenant(**args) is True

    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("lease_email.s")]
    assert len(lines) == 2
    for line in lines:
        assert f"lease_id={lease.id}" in line
        assert "recipient=***@example.com" in line
        assert "jane" not in line and "j***" not in line
