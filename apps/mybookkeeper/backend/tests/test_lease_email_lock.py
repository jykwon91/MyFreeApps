"""Emailing the tenant locks the lease before anything is read for the send.

What is read for the email is what the tenant gets: once it has been read, a
regenerate is refused, so the files that go out are still the lease's record.
"""
from __future__ import annotations

import datetime as _dt
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.leases import lease_email_service
from app.services.leases.lease_pdf_service import generate_lease
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from tests.lease_email_support import EMAIL, email_patches
from tests.lease_regenerate_support import (
    OLD_KEY,
    lease_with_rendered_attachment,
    real_uow,  # noqa: F401 — fixture
    patches,
    rendered_keys,
    storage_double,
)


@pytest.mark.asyncio
async def test_a_regenerate_after_the_email_was_read_is_refused_and_the_old_files_stay(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double()
    regenerate_patches = patches(storage)
    outcome: dict[str, BaseException | None] = {}

    @asynccontextmanager
    async def uow_with_a_regenerate_after_the_first_commit() -> AsyncIterator[AsyncSession]:
        first = "ran" not in outcome
        async with real_uow() as session:
            yield session
        if first:
            outcome["ran"] = None
            try:
                with regenerate_patches[0], regenerate_patches[1], regenerate_patches[2], regenerate_patches[3]:
                    await generate_lease(
                        user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
                    )
            except LeaseDocumentsLockedError as exc:
                outcome["error"] = exc

    monkeypatch.setattr(f"{EMAIL}.unit_of_work", uow_with_a_regenerate_after_the_first_commit)
    send = MagicMock(return_value=True)
    p = email_patches(storage, send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        assert await lease_email_service.send_lease_to_tenant(
            lease_id=lease_id, user_id=user_id, organization_id=org_id,
        ) is True

    assert isinstance(outcome.get("error"), LeaseDocumentsLockedError)
    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    send.assert_called_once()


@pytest.mark.asyncio
async def test_the_lease_stays_locked_when_the_send_fails_and_can_be_sent_again(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    monkeypatch.setattr(f"{EMAIL}.unit_of_work", real_uow)
    send = MagicMock(side_effect=[False, True])
    p = email_patches(storage_double(), send)
    args = dict(lease_id=lease.id, user_id=user_id, organization_id=org_id)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        first = await lease_email_service.send_lease_to_tenant(**args)
        await db.refresh(lease)
        stamped = lease.last_emailed_to_tenant_at
        second = await lease_email_service.send_lease_to_tenant(**args)

    assert (first, second) == (False, True)
    assert stamped is not None


@pytest.mark.asyncio
async def test_nothing_is_stamped_when_there_is_nothing_to_send(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    monkeypatch.setattr(f"{EMAIL}.unit_of_work", real_uow)
    send = MagicMock(return_value=True)
    p = email_patches(storage_double(), send, SimpleNamespace(legal_name="J", contact_email=None))

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        sent = await lease_email_service.send_lease_to_tenant(
            lease_id=lease.id, user_id=user_id, organization_id=org_id,
        )

    await db.refresh(lease)
    assert sent is False and lease.last_emailed_to_tenant_at is None
    send.assert_not_called()


@pytest.mark.asyncio
async def test_the_stamp_is_rolled_back_when_a_file_cannot_be_fetched(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    monkeypatch.setattr(f"{EMAIL}.unit_of_work", real_uow)
    storage = storage_double()
    storage.download_file.side_effect = RuntimeError("storage down")
    send = MagicMock(return_value=True)
    p = email_patches(storage, send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        sent = await lease_email_service.send_lease_to_tenant(
            lease_id=lease.id, user_id=user_id, organization_id=org_id,
        )

    await db.refresh(lease)
    assert sent is False and lease.last_emailed_to_tenant_at is None
    send.assert_not_called()
