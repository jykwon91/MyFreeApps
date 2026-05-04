"""Tests that the Gmail discovery service updates Integration.last_synced_at on success.

Regression coverage for the bug where successful Gmail syncs left
``Integration.last_synced_at`` permanently NULL because the discovery service
wrote a ``sync_logs`` row with ``status='success'`` but never bumped the parent
integration's timestamp. The UI consequently showed "Last synced never" forever.

Behaviour under test:
- Successful "nothing new" discovery (no new emails)  -> last_synced_at IS updated.
- Successful "no extractable sources" discovery (emails found, no attachments)
  -> last_synced_at IS updated.
- Successful "queued" discovery (emails found and queued)
  -> last_synced_at NOT touched here; it is updated downstream when the
     extraction stage finalises the sync log.
- Failed discovery (Gmail auth expired)
  -> last_synced_at NOT updated.
- Multiple successful discoveries in sequence
  -> last_synced_at is bumped on every successful run.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.email.exceptions import GmailAuthExpiredError


def _make_ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        org_role=OrgRole.OWNER,
    )


def _make_integration() -> MagicMock:
    """Stand-in for an Integration row, mirroring the real model's accessors."""
    integration = MagicMock()
    integration.access_token = "enc-access"
    integration.refresh_token = "enc-refresh"
    integration.last_synced_at = None
    return integration


def _patch_discovery_dependencies(
    *,
    integration: MagicMock,
    new_ids: list[str],
    sources_data: dict | None = None,
    list_new_ids_side_effect: Exception | None = None,
):
    """Build a stack of patches matching test_gmail_auth_expired.py's pattern.

    Returns a list of patch context managers the test should enter via
    contextlib.ExitStack so individual call assertions can be made afterwards.
    """
    fake_db = MagicMock()
    fake_db.flush = AsyncMock()

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    patches = [
        patch("app.services.email.email_discovery_service.unit_of_work", fake_uow),
        patch(
            "app.services.email.email_discovery_service.integration_repo.get_by_org_and_provider",
            new=AsyncMock(return_value=integration),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.timeout_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.count_running",
            new=AsyncMock(return_value=0),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.reset_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.get_gmail_service",
            return_value=MagicMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.get_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.document_repo.get_email_message_ids",
            new=AsyncMock(return_value=set()),
        ),
    ]

    if list_new_ids_side_effect is not None:
        patches.append(
            patch(
                "app.services.email.email_discovery_service.list_new_email_ids",
                side_effect=list_new_ids_side_effect,
            )
        )
    else:
        patches.append(
            patch(
                "app.services.email.email_discovery_service.list_new_email_ids",
                return_value=(new_ids, len(new_ids)),
            )
        )

    if sources_data is not None:
        patches.append(
            patch(
                "app.services.email.email_discovery_service.list_email_document_sources",
                return_value=sources_data,
            )
        )

    patches.append(
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.insert_ignore_conflict",
            new=AsyncMock(),
        )
    )

    return patches, fake_db


@pytest.mark.asyncio
async def test_last_synced_updated_when_no_new_emails() -> None:
    """The most common path: discovery finds 0 new emails -> last_synced_at IS bumped."""
    ctx = _make_ctx()
    integration = _make_integration()

    patches, _ = _patch_discovery_dependencies(integration=integration, new_ids=[])

    update_calls: list[tuple[object, datetime]] = []

    async def fake_update_last_synced(_db, integ, synced_at):
        update_calls.append((integ, synced_at))
        integ.last_synced_at = synced_at

    sync_log_create_calls: list[dict] = []

    async def fake_create(_db, _org_id, _user_id, _provider, status, **kwargs):
        sync_log_create_calls.append({"status": status, **kwargs})
        return MagicMock(id=1)

    from contextlib import ExitStack

    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                new=fake_update_last_synced,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=fake_create,
            )
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        before = datetime.now(timezone.utc)
        result = await discover_gmail_emails(ctx)
        after = datetime.now(timezone.utc)

    assert result.status == "nothing_new"
    assert len(update_calls) == 1, "update_last_synced must be called exactly once"
    bumped_integration, bumped_at = update_calls[0]
    assert bumped_integration is integration
    assert bumped_at.tzinfo is not None, "timestamp must be timezone-aware (UTC)"
    assert before <= bumped_at <= after
    assert integration.last_synced_at == bumped_at

    # The success sync_log row and the integration timestamp share the SAME instant -
    # this guarantees the two writes can never diverge.
    assert len(sync_log_create_calls) == 1
    success_log = sync_log_create_calls[0]
    assert success_log["status"] == "success"
    assert success_log["completed_at"] == bumped_at
    assert success_log["started_at"] == bumped_at


@pytest.mark.asyncio
async def test_last_synced_updated_when_emails_found_but_no_extractable_sources() -> None:
    """Discovery finds new emails but none have extractable attachments/body -> last_synced_at IS bumped."""
    ctx = _make_ctx()
    integration = _make_integration()

    # New email IDs are returned but each yields zero sources.
    patches, _ = _patch_discovery_dependencies(
        integration=integration,
        new_ids=["msg-1", "msg-2"],
        sources_data={"subject": "Empty", "sources": []},
    )

    update_calls: list[tuple[object, datetime]] = []

    async def fake_update_last_synced(_db, integ, synced_at):
        update_calls.append((integ, synced_at))
        integ.last_synced_at = synced_at

    fake_log = MagicMock(id=42, total_items=0)

    async def fake_create(*_args, **_kwargs):
        return fake_log

    async def fake_mark_completed(_db, log, status, *, error=None):
        log.status = status
        log.completed_at = datetime.now(timezone.utc)

    from contextlib import ExitStack

    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                new=fake_update_last_synced,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=fake_create,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
                new=fake_mark_completed,
            )
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        before = datetime.now(timezone.utc)
        result = await discover_gmail_emails(ctx)
        after = datetime.now(timezone.utc)

    assert result.status == "nothing_new"
    assert len(update_calls) == 1
    bumped_integration, bumped_at = update_calls[0]
    assert bumped_integration is integration
    assert before <= bumped_at <= after
    assert integration.last_synced_at == bumped_at


@pytest.mark.asyncio
async def test_last_synced_NOT_updated_when_emails_queued_for_extraction() -> None:
    """Discovery queues sources for extraction (status="queued") -> last_synced_at left
    untouched in this stage. The downstream extraction stage owns the bump."""
    ctx = _make_ctx()
    integration = _make_integration()

    patches, _ = _patch_discovery_dependencies(
        integration=integration,
        new_ids=["msg-1"],
        sources_data={
            "subject": "Receipt",
            "sources": [
                {"attachment_id": "att-1", "filename": "r.pdf", "content_type": "application/pdf"}
            ],
        },
    )

    update_calls: list[tuple[object, datetime]] = []

    async def fake_update_last_synced(_db, integ, synced_at):
        update_calls.append((integ, synced_at))

    fake_log = MagicMock(id=99, total_items=0)

    async def fake_create(*_args, **_kwargs):
        return fake_log

    from contextlib import ExitStack

    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                new=fake_update_last_synced,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=fake_create,
            )
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        result = await discover_gmail_emails(ctx)

    assert result.status == "queued"
    assert result.sync_log_id == 99
    assert update_calls == [], (
        "Discovery must NOT bump last_synced_at when it queues work for the extractor; "
        "the extraction service is responsible for the final timestamp."
    )
    assert integration.last_synced_at is None


@pytest.mark.asyncio
async def test_last_synced_NOT_updated_when_gmail_auth_expired() -> None:
    """Failed discovery (refresh token rejected) must NOT bump last_synced_at."""
    ctx = _make_ctx()
    integration = _make_integration()

    patches, _ = _patch_discovery_dependencies(
        integration=integration,
        new_ids=[],
        list_new_ids_side_effect=RefreshError("invalid_grant"),
    )

    update_calls: list[tuple[object, datetime]] = []

    async def fake_update_last_synced(_db, integ, synced_at):
        update_calls.append((integ, synced_at))

    async def fake_create(*_args, **_kwargs):
        return MagicMock(id=1)

    async def fake_mark_completed(_db, _log, _status, *, error=None):
        return None

    from contextlib import ExitStack

    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                new=fake_update_last_synced,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=fake_create,
            )
        )
        stack.enter_context(
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
                new=fake_mark_completed,
            )
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        with pytest.raises(GmailAuthExpiredError):
            await discover_gmail_emails(ctx)

    assert update_calls == [], (
        "Failed syncs must never bump last_synced_at - the previous successful "
        "timestamp (or NULL) must be preserved."
    )
    assert integration.last_synced_at is None


@pytest.mark.asyncio
async def test_last_synced_bumped_on_each_successive_successful_sync() -> None:
    """Multiple successful syncs in sequence each bump last_synced_at to a fresh timestamp."""
    ctx = _make_ctx()
    integration = _make_integration()

    update_calls: list[tuple[object, datetime]] = []

    async def fake_update_last_synced(_db, integ, synced_at):
        update_calls.append((integ, synced_at))
        integ.last_synced_at = synced_at

    async def fake_create(*_args, **_kwargs):
        return MagicMock(id=len(update_calls) + 1)

    timestamps: list[datetime] = []
    for _ in range(3):
        patches, _ = _patch_discovery_dependencies(integration=integration, new_ids=[])
        from contextlib import ExitStack

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(
                patch(
                    "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                    new=fake_update_last_synced,
                )
            )
            stack.enter_context(
                patch(
                    "app.services.email.email_discovery_service.sync_log_repo.create",
                    new=fake_create,
                )
            )

            from app.services.email.email_discovery_service import discover_gmail_emails

            await discover_gmail_emails(ctx)
            timestamps.append(integration.last_synced_at)

    assert len(update_calls) == 3
    # Each successive sync produces a fresh, non-decreasing timestamp.
    assert timestamps[0] <= timestamps[1] <= timestamps[2]
    # And all three timestamps actually exist (none are None).
    assert all(t is not None for t in timestamps)
