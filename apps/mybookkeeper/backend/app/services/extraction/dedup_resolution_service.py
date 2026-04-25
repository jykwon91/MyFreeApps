"""Dedup resolution service — acts on DedupDecision from dedup_service.

Handles: create, skip, replace, review.
Links documents via transaction_documents junction table.
"""
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.transaction import Transaction
from app.repositories import extraction_repo, transaction_repo
from app.services.extraction.dedup_service import DedupDecision

logger = logging.getLogger(__name__)


def handle_amount_conflict(existing: Transaction, new_amount: Decimal | None) -> None:
    """Flag an existing transaction for review when a new source reports a different amount."""
    if new_amount is not None and existing.amount != abs(new_amount):
        existing.status = "needs_review"
        review_fields = list(existing.review_fields or [])
        if "amount" not in review_fields:
            review_fields.append("amount")
        existing.review_fields = review_fields
        logger.info(
            "Amount conflict on transaction %s: existing=%s, new=%s",
            existing.id, existing.amount, new_amount,
        )


async def resolve_and_link(
    db: AsyncSession,
    decision: DedupDecision,
    new_transaction: Transaction | None,
    document_id: uuid.UUID,
    extraction_id: uuid.UUID | None = None,
) -> Transaction | None:
    """Execute a dedup decision and return the surviving transaction.

    Returns None if the transaction was skipped (no new record created).
    """
    if decision.action == "create":
        if new_transaction:
            await transaction_repo.create(db, new_transaction)
            await _link_document(db, new_transaction.id, document_id, extraction_id, "duplicate_source")
        return new_transaction

    if decision.action == "skip":
        # Don't create a new transaction; link the document to the existing one
        existing = decision.existing_transaction
        if existing:
            await _link_document(db, existing.id, document_id, extraction_id, "corroborating")
            logger.info(
                "Dedup skip: linked doc %s to existing txn %s — %s",
                document_id, existing.id, decision.reason,
            )
        return None

    if decision.action == "replace":
        existing = decision.existing_transaction
        if existing and new_transaction:
            # Copy user edits from old to new
            _copy_user_edits(existing, new_transaction)

            # Soft-delete existing
            existing.deleted_at = datetime.now(timezone.utc)

            # Create new transaction
            await transaction_repo.create(db, new_transaction)

            # Link both documents to new transaction
            await _link_document(db, new_transaction.id, document_id, extraction_id, "duplicate_source")
            if existing.extraction_id:
                existing_doc_id = await _get_document_id_from_extraction(db, existing.extraction_id)
                if existing_doc_id:
                    await _link_document(db, new_transaction.id, existing_doc_id, existing.extraction_id, "corroborating")

            logger.info(
                "Dedup replace: replaced txn %s with new txn %s — %s",
                existing.id, new_transaction.id, decision.reason,
            )
        return new_transaction

    if decision.action == "review":
        # Create new transaction with needs_review status
        if new_transaction:
            new_transaction.status = "needs_review"
            if not new_transaction.review_fields:
                new_transaction.review_fields = ["vendor"]
            # Set review_reason from dedup decision, preserving any existing reason
            if new_transaction.review_reason:
                new_transaction.review_reason = f"{new_transaction.review_reason} | {decision.reason}"
            else:
                new_transaction.review_reason = decision.reason
            await transaction_repo.create(db, new_transaction)
            await _link_document(db, new_transaction.id, document_id, extraction_id, "duplicate_source")
            logger.info(
                "Dedup review: created txn %s for review — %s",
                new_transaction.id, decision.reason,
            )
        return new_transaction

    return new_transaction


async def _link_document(
    db: AsyncSession,
    transaction_id: uuid.UUID,
    document_id: uuid.UUID,
    extraction_id: uuid.UUID | None,
    link_type: str,
) -> None:
    """Create a TransactionDocument link."""
    await transaction_repo.create_transaction_document_link(
        db, transaction_id, document_id, extraction_id, link_type,
    )


def _copy_user_edits(old: Transaction, new: Transaction) -> None:
    """Copy user edits from old transaction to new one."""
    if old.property_id and not new.property_id:
        new.property_id = old.property_id
    if old.category != "uncategorized" and new.category == "uncategorized":
        new.category = old.category
    if old.tags and not new.tags:
        new.tags = old.tags
    if old.schedule_e_line and not new.schedule_e_line:
        new.schedule_e_line = old.schedule_e_line


async def _get_document_id_from_extraction(
    db: AsyncSession, extraction_id: uuid.UUID,
) -> uuid.UUID | None:
    """Get the document_id from an extraction."""
    return await extraction_repo.get_document_id(db, extraction_id)
