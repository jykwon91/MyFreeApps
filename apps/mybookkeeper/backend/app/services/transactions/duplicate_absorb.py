"""Fold duplicate rows into the one that survives — shared by merge and "keep this one"."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.leases import pending_rent_receipt_repo
from app.repositories.transactions import attribution_repo
from app.services.transactions.duplicate_carry_over import carry_over_fields


async def absorb_duplicates(db: AsyncSession, survivor: Transaction, removed: list[Transaction]) -> None:
    """Give the survivor what only the removed rows held, then soft-delete them.

    Links and classifications the survivor lacks are copied (refusing with
    ``MergeConflictError`` on different tenants, vendors or activities), and
    document links, rent receipts and an open attribution review move across
    (the review is closed instead when the survivor already has a tenant).
    Rent allocation is derived from each payment's ``applicant_id``, so carrying
    the tenant link is what keeps the payment on the tenant's ledger.
    """
    carry_over_fields(survivor, removed)
    for txn in removed:
        await transaction_repo.transfer_document_links(db, txn.id, survivor.id)
        await pending_rent_receipt_repo.move_to_transaction(
            db,
            from_transaction_id=txn.id,
            to_transaction_id=survivor.id,
            organization_id=survivor.organization_id,
        )
        if survivor.applicant_id is None:
            await attribution_repo.move_pending_review(
                db,
                from_transaction_id=txn.id,
                to_transaction_id=survivor.id,
                organization_id=survivor.organization_id,
            )
        else:
            # The surviving row already says who paid, which answers the
            # removed copy's open "who paid this?" question.
            await attribution_repo.resolve_pending_for_transaction(
                db,
                transaction_id=txn.id,
                organization_id=survivor.organization_id,
                status="confirmed",
            )
    await transaction_repo.soft_delete_transactions(db, removed)
