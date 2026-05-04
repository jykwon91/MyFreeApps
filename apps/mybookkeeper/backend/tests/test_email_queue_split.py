import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.email.email_queue import EmailQueue
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.integrations.sync_log import SyncLog
from app.models.user.user import User


def _make_integration(org_id: uuid.UUID, user_id: uuid.UUID) -> Integration:
    integration = Integration(
        organization_id=org_id,
        user_id=user_id,
        provider="gmail",
    )
    integration.access_token = "enc_access"
    integration.refresh_token = "enc_refresh"
    return integration


def _make_sync_log(org_id: uuid.UUID, user_id: uuid.UUID, status: str = "running") -> SyncLog:
    return SyncLog(
        organization_id=org_id,
        user_id=user_id,
        provider="gmail",
        status=status,
        started_at=datetime.now(timezone.utc),
    )


def _make_queue_item(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    sync_log_id: int,
    *,
    status: str = "pending",
    raw_content: bytes | None = None,
    error: str | None = None,
    attachment_id: str = "att_123",
    attachment_filename: str = "invoice.pdf",
) -> EmailQueue:
    return EmailQueue(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        message_id=f"msg_{uuid.uuid4().hex[:8]}",
        attachment_id=attachment_id,
        attachment_filename=attachment_filename,
        attachment_content_type="application/pdf",
        email_subject="Test email",
        sync_log_id=sync_log_id,
        raw_content=raw_content,
        status=status,
        error=error,
    )


@pytest.fixture()
async def setup_data(
    db: AsyncSession, test_user: User, test_org: Organization
) -> tuple[Integration, SyncLog, RequestContext]:
    integration = _make_integration(test_org.id, test_user.id)
    db.add(integration)
    await db.flush()

    log = _make_sync_log(test_org.id, test_user.id)
    db.add(log)
    await db.flush()

    ctx = RequestContext(
        organization_id=test_org.id,
        user_id=test_user.id,
        org_role=OrgRole.OWNER,
    )

    return integration, log, ctx


class TestDrainGmailFetch:
    """Tests for drain_gmail_fetch — downloads bytes from Gmail."""

    @pytest.mark.asyncio
    async def test_pending_to_fetched(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(test_org.id, test_user.id, log.id, status="pending")
        db.add(item)
        await db.commit()

        fake_bytes = b"PDF content here"

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.email.email_fetch_service.unit_of_work", _fake),
            patch("app.services.email.email_fetch_service.AsyncSessionLocal", _fake),
            patch("app.services.email.email_fetch_service.get_gmail_service") as mock_gmail,
            patch("app.services.email.email_fetch_service.fetch_attachment_bytes", return_value=fake_bytes),
        ):
            mock_gmail.return_value = MagicMock()

            from app.services.email.email_fetch_service import _fetch_next_pending

            result = await _fetch_next_pending(ctx)

        assert result.status == "fetched"
        await db.refresh(item)
        assert item.status == "fetched"
        # raw_content is deferred — query it explicitly to avoid greenlet issues
        from sqlalchemy.orm import undefer
        row = await db.execute(
            select(EmailQueue).options(undefer(EmailQueue.raw_content)).where(EmailQueue.id == item.id)
        )
        reloaded = row.scalar_one()
        assert reloaded.raw_content == fake_bytes

    @pytest.mark.asyncio
    async def test_nothing_to_fetch_when_no_pending(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(test_org.id, test_user.id, log.id, status="fetched", raw_content=b"data")
        db.add(item)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.email.email_fetch_service.unit_of_work", _fake):
            from app.services.email.email_fetch_service import _fetch_next_pending

            result = await _fetch_next_pending(ctx)

        assert result.status == "nothing_to_fetch"


class TestDrainClaudeExtraction:
    """Tests for drain_claude_extraction — runs Claude on fetched content."""

    @pytest.mark.asyncio
    async def test_fetched_to_done(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(
            test_org.id, test_user.id, log.id, status="fetched", raw_content=b"PDF bytes"
        )
        db.add(item)
        await db.commit()

        fake_extraction = {"data": [], "tokens": 100}

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.email.email_extraction_service.unit_of_work", _fake),
            patch("app.services.email.email_extraction_service._extract_from_attachment", return_value=fake_extraction),
        ):
            from app.services.email.email_extraction_service import _extract_next_fetched

            result = await _extract_next_fetched(ctx)

        assert result.status == "done"
        await db.refresh(item)
        # Extraction returned an empty data array (zero documents extracted),
        # so the queue row is now ``skipped`` rather than ``done``. This
        # distinction lets a future sync re-fetch the message if the prompt
        # later improves — see email_queue_repo.get_message_ids dedup rule.
        assert item.status == "skipped"
        # raw_content is deferred — query it explicitly to avoid greenlet issues
        from sqlalchemy.orm import undefer
        row = await db.execute(
            select(EmailQueue).options(undefer(EmailQueue.raw_content)).where(EmailQueue.id == item.id)
        )
        reloaded = row.scalar_one()
        assert reloaded.raw_content is None

    @pytest.mark.asyncio
    async def test_nothing_to_extract_when_no_fetched(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(test_org.id, test_user.id, log.id, status="done")
        db.add(item)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.email.email_extraction_service.unit_of_work", _fake):
            from app.services.email.email_extraction_service import _extract_next_fetched

            result = await _extract_next_fetched(ctx)

        assert result.status == "nothing_to_extract"

    @pytest.mark.asyncio
    async def test_fails_when_no_raw_content(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(test_org.id, test_user.id, log.id, status="fetched", raw_content=None)
        db.add(item)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.email.email_extraction_service.unit_of_work", _fake):
            from app.services.email.email_extraction_service import _extract_next_fetched

            result = await _extract_next_fetched(ctx)

        assert result.status == "failed"
        assert result.error == "No raw content to extract"


class TestRetryLogic:
    """Tests for retry endpoint logic — failed items reset based on raw_content."""

    @pytest.mark.asyncio
    async def test_retry_with_raw_content_goes_to_fetched(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, _ = setup_data
        item = _make_queue_item(
            test_org.id,
            test_user.id,
            log.id,
            status="failed",
            raw_content=b"some data",
            error="Claude timeout",
        )
        db.add(item)
        await db.commit()

        item.error = None
        item.status = "fetched" if item.raw_content is not None else "pending"
        await db.commit()

        await db.refresh(item)
        assert item.status == "fetched"
        assert item.error is None

    @pytest.mark.asyncio
    async def test_retry_without_raw_content_goes_to_pending(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, _ = setup_data
        item = _make_queue_item(
            test_org.id,
            test_user.id,
            log.id,
            status="failed",
            raw_content=None,
            error="Gmail fetch failed",
        )
        db.add(item)
        await db.commit()

        item.error = None
        item.status = "fetched" if item.raw_content is not None else "pending"
        await db.commit()

        await db.refresh(item)
        assert item.status == "pending"
        assert item.error is None

    @pytest.mark.asyncio
    async def test_retry_all_splits_correctly(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        from sqlalchemy import update

        _, log, _ = setup_data
        item_with_content = _make_queue_item(
            test_org.id,
            test_user.id,
            log.id,
            status="failed",
            raw_content=b"data",
            error="err1",
            attachment_id="att_a",
        )
        item_without_content = _make_queue_item(
            test_org.id,
            test_user.id,
            log.id,
            status="failed",
            raw_content=None,
            error="err2",
            attachment_id="att_b",
        )
        db.add_all([item_with_content, item_without_content])
        await db.commit()

        # Simulate retry-all logic
        await db.execute(
            update(EmailQueue)
            .where(
                EmailQueue.organization_id == test_org.id,
                EmailQueue.status == "failed",
                EmailQueue.raw_content.isnot(None),
            )
            .values(status="fetched", error=None)
        )
        await db.execute(
            update(EmailQueue)
            .where(
                EmailQueue.organization_id == test_org.id,
                EmailQueue.status == "failed",
                EmailQueue.raw_content.is_(None),
            )
            .values(status="pending", error=None)
        )
        await db.commit()

        await db.refresh(item_with_content)
        await db.refresh(item_without_content)
        assert item_with_content.status == "fetched"
        assert item_without_content.status == "pending"


class TestQueueListing:
    """Tests for queue listing — excludes raw_content from response."""

    @pytest.mark.asyncio
    async def test_queue_items_returned_without_raw_content(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, _ = setup_data
        item = _make_queue_item(
            test_org.id, test_user.id, log.id, status="fetched", raw_content=b"big data"
        )
        db.add(item)
        await db.commit()

        result = await db.execute(
            select(EmailQueue)
            .where(EmailQueue.organization_id == test_org.id)
            .order_by(EmailQueue.created_at.desc())
            .limit(100)
        )
        items = result.scalars().all()
        assert len(items) == 1

        response = {
            "id": str(items[0].id),
            "attachment_filename": items[0].attachment_filename,
            "email_subject": items[0].email_subject,
            "status": items[0].status,
            "error": items[0].error,
        }
        assert "raw_content" not in response
        assert response["status"] == "fetched"
        assert response["attachment_filename"] == "invoice.pdf"

    @pytest.mark.asyncio
    async def test_get_queue_items_includes_sync_log_id(
        self, db: AsyncSession, test_user: User, test_org: Organization, setup_data: tuple[Integration, SyncLog, RequestContext]
    ) -> None:
        _, log, ctx = setup_data
        item = _make_queue_item(test_org.id, test_user.id, log.id, status="fetched")
        db.add(item)
        await db.commit()

        with patch("app.services.integrations.integration_service.AsyncSessionLocal") as mock_session_cls:
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from app.services.integrations.integration_service import get_queue_items

            result = await get_queue_items(ctx)

        assert len(result) >= 1
        latest = result[0]
        assert "sync_log_id" in latest
        assert latest["sync_log_id"] == log.id
