"""The Gmail label filter: saving it on the connection, showing it, and syncing by it."""
import uuid
from contextlib import ExitStack, asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.integrations import update_gmail_label as update_gmail_label_route
from app.core.context import RequestContext
from app.mappers.integration_mapper import gmail_label_of, to_integration_info
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.schemas.integrations.gmail_label_update import GmailLabelUpdate
from app.services.email.email_discovery_service import discover_gmail_emails
from app.services.integrations import integration_service
from tests.test_email_discovery_last_synced import _patch_discovery_dependencies

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch.object(integration_service, "unit_of_work", _fake_uow),
        patch.object(integration_service, "AsyncSessionLocal", _fake_uow),
    ):
        yield


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org.id, org_role=OrgRole.OWNER)


async def _connect_gmail(db: AsyncSession, org: Organization, user: User) -> Integration:
    integration = Integration(
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        metadata_={"scopes": SCOPES},
    )
    integration.access_token = "access"
    integration.refresh_token = "refresh"
    db.add(integration)
    await db.commit()
    return integration


class TestMapper:
    def test_no_label_means_sync_everything(self) -> None:
        assert gmail_label_of(Integration(provider="gmail", metadata_=None)) is None
        assert gmail_label_of(Integration(provider="gmail", metadata_={"scopes": SCOPES})) is None
        assert gmail_label_of(Integration(provider="gmail", metadata_={"gmail_label": ""})) is None

    def test_reads_the_saved_label(self) -> None:
        assert gmail_label_of(Integration(provider="gmail", metadata_={"gmail_label": "Receipts"})) == "Receipts"

    def test_gmail_info_carries_the_label(self) -> None:
        integration = Integration(provider="gmail", metadata_={"gmail_label": "Receipts"}, needs_reauth=False)

        info = to_integration_info(integration, has_send_scope=False)

        assert info["gmail_label"] == "Receipts"
        assert info["has_send_scope"] is False


class TestUpdateGmailLabel:
    @pytest.mark.asyncio
    async def test_saves_the_trimmed_label_and_keeps_the_rest_of_the_metadata(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        integration = await _connect_gmail(db, test_org, test_user)

        info = await integration_service.update_gmail_label(_ctx(test_org, test_user), "  Receipts ")

        assert info is not None and info["gmail_label"] == "Receipts"
        await db.refresh(integration)
        assert integration.metadata_ == {"scopes": SCOPES, "gmail_label": "Receipts"}
        listed = await integration_service.list_integrations(_ctx(test_org, test_user))
        assert [i.get("gmail_label") for i in listed] == ["Receipts"]

    @pytest.mark.asyncio
    async def test_a_blank_label_clears_the_filter(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        integration = await _connect_gmail(db, test_org, test_user)
        await integration_service.update_gmail_label(_ctx(test_org, test_user), "Receipts")

        info = await integration_service.update_gmail_label(_ctx(test_org, test_user), "   ")

        assert info is not None and info["gmail_label"] is None
        await db.refresh(integration)
        assert integration.metadata_ == {"scopes": SCOPES}

    @pytest.mark.asyncio
    async def test_none_when_gmail_is_not_connected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        assert await integration_service.update_gmail_label(_ctx(test_org, test_user), "Receipts") is None

    @pytest.mark.asyncio
    async def test_route_is_404_when_gmail_is_not_connected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await update_gmail_label_route(GmailLabelUpdate(label="Receipts"), ctx=_ctx(test_org, test_user))
        assert exc_info.value.status_code == 404

    def test_rejects_a_label_longer_than_gmail_allows(self) -> None:
        GmailLabelUpdate(label="x" * 225)
        with pytest.raises(ValidationError):
            GmailLabelUpdate(label="x" * 226)

    def test_rejects_unknown_fields(self) -> None:
        with pytest.raises(ValidationError):
            GmailLabelUpdate(label="Receipts", gmail_label="Receipts")  # type: ignore[call-arg]


class TestDiscoveryUsesTheLabel:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(("metadata", "expected"), [({"gmail_label": "Receipts"}, "Receipts"), ({}, None)])
    async def test_lists_gmail_by_the_connections_label(self, metadata: dict, expected: str | None) -> None:
        integration = MagicMock()
        integration.access_token = "enc-access"
        integration.refresh_token = "enc-refresh"
        integration.metadata_ = metadata
        patches, _ = _patch_discovery_dependencies(integration=integration, new_ids=[])
        ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced", new=AsyncMock(),
            ))
            stack.enter_context(patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=AsyncMock(return_value=MagicMock(id=1)),
            ))
            list_ids = stack.enter_context(patch(
                "app.services.email.email_discovery_service.list_new_email_ids", return_value=([], 0),
            ))
            await discover_gmail_emails(ctx)

        assert list_ids.call_args.kwargs["label"] == expected
