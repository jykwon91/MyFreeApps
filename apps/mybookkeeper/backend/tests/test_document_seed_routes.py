"""Tests for the test-only document seed route."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.test_helpers.document_seed import _SeedDocumentRequest, seed_document


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.document_seed.unit_of_work", _fake_uow):
        yield


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


class TestSeedDocument:
    @pytest.mark.asyncio
    async def test_adds_a_completed_document_of_the_type_to_my_organization(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = True
        try:
            seeded = await seed_document(
                _SeedDocumentRequest(file_name="e2e-w2.pdf", document_type="w2"),
                ctx=_ctx(test_org.id, test_user),
            )
        finally:
            settings.allow_test_admin_promotion = original

        document = (await db.execute(select(Document).where(Document.id == seeded.id))).scalar_one()
        assert document.organization_id == test_org.id
        assert document.user_id == test_user.id
        assert document.file_name == "e2e-w2.pdf"
        assert document.document_type == "w2"
        assert document.status == "completed"
        assert document.deleted_at is None

    def test_rejects_an_unknown_document_type(self) -> None:
        with pytest.raises(ValidationError):
            _SeedDocumentRequest(file_name="e2e.pdf", document_type="pdf")

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_document(
                    _SeedDocumentRequest(file_name="e2e.pdf", document_type="invoice"),
                    ctx=_ctx(test_org.id, test_user),
                )
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(Document))).first() is None
