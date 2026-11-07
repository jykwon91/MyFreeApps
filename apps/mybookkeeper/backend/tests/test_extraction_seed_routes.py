"""Tests for the test-only extracted-transaction seed route."""
import io
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, undefer

from app.core.config import settings
from app.core.context import RequestContext
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.test_helpers.extraction_seed import (
    SOURCE_PNG,
    _SeedExtractedTransactionRequest,
    seed_extracted_transaction,
)


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.extraction_seed.unit_of_work", _fake_uow):
        yield


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


def _request(**overrides: object) -> _SeedExtractedTransactionRequest:
    fields: dict[str, object] = {
        "file_name": "e2e-receipt.png",
        "vendor": "E2E Roofer",
        "amount": "420.00",
        "transaction_date": "2026-02-03",
        "review_reason": "I couldn't tell which property this is for.",
        **overrides,
    }
    return _SeedExtractedTransactionRequest.model_validate(fields)


class TestSeedExtractedTransaction:
    @pytest.mark.asyncio
    async def test_adds_a_flagged_transaction_linked_to_its_source_document(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = True
        try:
            seeded = await seed_extracted_transaction(_request(), ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original

        txn = (
            await db.execute(
                select(Transaction)
                .where(Transaction.id == seeded.transaction_id)
                .options(selectinload(Transaction.extraction).selectinload(Extraction.document))
            )
        ).scalar_one()
        assert txn.organization_id == test_org.id
        assert txn.status == "needs_review"
        assert txn.review_reason == "I couldn't tell which property this is for."
        assert txn.vendor == "E2E Roofer"
        assert txn.amount == Decimal("420.00")
        assert txn.transaction_date == date(2026, 2, 3)
        assert txn.tax_year == 2026
        assert txn.source_document_id == seeded.document_id
        assert txn.source_file_name == "e2e-receipt.png"

        document = (
            await db.execute(
                select(Document)
                .where(Document.id == seeded.document_id)
                .options(undefer(Document.file_content))
            )
        ).scalar_one()
        assert document.organization_id == test_org.id
        assert document.status == "completed"
        assert document.file_mime_type == "image/png"
        assert document.file_content == SOURCE_PNG

    def test_the_source_document_is_a_real_png(self) -> None:
        image = Image.open(io.BytesIO(SOURCE_PNG))
        image.load()
        assert image.format == "PNG"
        assert image.size == (1, 1)

    @pytest.mark.parametrize("field, value", [
        ("file_name", "e2e-receipt.pdf"),
        ("amount", "0"),
        ("review_reason", ""),
        ("review_reason", "x" * 2001),
    ])
    def test_rejects_invalid_input(self, field: str, value: str) -> None:
        with pytest.raises(ValidationError):
            _request(**{field: value})

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_extracted_transaction(_request(), ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(Transaction))).first() is None
        assert (await db.execute(select(Document))).first() is None
