"""Test-only helper: add a transaction the way extraction leaves one, without
running extraction.

Extraction needs an Anthropic key, so on a keyless E2E stack no upload ever
produces a transaction. Only extraction sets a review reason or links a
transaction to the document it came from, so tests of those need this route.
"""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction
from app.repositories.documents import document_repo
from app.repositories.extraction import extraction_repo
from app.repositories.transactions import transaction_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()

# A 1x1 PNG, so the source document opens as an image.
SOURCE_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63606060f80f00010401005fe5c34b"
    "0000000049454e44ae426082"
)


class _SeedExtractedTransactionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    file_name: str = Field(min_length=1, max_length=500, pattern=r"\.png$")
    vendor: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_date: date
    review_reason: str = Field(min_length=1, max_length=2000)


class _SeededExtractedTransaction(BaseModel):
    transaction_id: uuid.UUID
    document_id: uuid.UUID


@router.post("/test/seed-extracted-transaction", status_code=201)
async def seed_extracted_transaction(
    payload: _SeedExtractedTransactionRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeededExtractedTransaction:
    """Add an expense that extraction flagged for review, with its source document."""
    _require_test_mode()
    async with unit_of_work() as db:
        document = await document_repo.create(
            db,
            Document(
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                file_name=payload.file_name,
                file_type="image",
                file_content=SOURCE_PNG,
                file_mime_type="image/png",
                document_type="invoice",
                source="upload",
                status="completed",
            ),
        )
        extraction = await extraction_repo.create(
            db,
            Extraction(
                document_id=document.id,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                status="completed",
                confidence="low",
                document_type="invoice",
            ),
        )
        transaction = await transaction_repo.create(
            db,
            Transaction(
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                extraction_id=extraction.id,
                transaction_date=payload.transaction_date,
                tax_year=payload.transaction_date.year,
                vendor=payload.vendor,
                amount=payload.amount,
                transaction_type="expense",
                category="maintenance",
                status="needs_review",
                review_reason=payload.review_reason,
            ),
        )
        return _SeededExtractedTransaction(transaction_id=transaction.id, document_id=document.id)
