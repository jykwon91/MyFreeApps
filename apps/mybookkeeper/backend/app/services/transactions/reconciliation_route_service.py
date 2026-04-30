"""Reconciliation route service — handles 1099 uploads, source listing, auto-matching, and manual matching."""
import logging
import uuid
from collections.abc import Sequence
from decimal import Decimal

from app.core.context import RequestContext
from app.core.vendors import normalize_vendor
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.repositories import reconciliation_repo, booking_statement_repo, transaction_repo

logger = logging.getLogger(__name__)


async def upload_1099(
    ctx: RequestContext,
    source_type: str,
    tax_year: int,
    issuer: str | None,
    reported_amount: Decimal,
) -> ReconciliationSource:
    async with unit_of_work() as db:
        source = ReconciliationSource(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            source_type=source_type,
            tax_year=tax_year,
            issuer=issuer,
            reported_amount=reported_amount,
        )
        created = await reconciliation_repo.create_source(
            db, source, load_relations=["document"],
        )
        return created


async def list_sources(
    ctx: RequestContext, tax_year: int,
) -> Sequence[ReconciliationSource]:
    async with AsyncSessionLocal() as db:
        return list(await reconciliation_repo.list_sources(
            db, ctx.organization_id, tax_year,
        ))


async def get_discrepancies(
    ctx: RequestContext, tax_year: int,
) -> Sequence[ReconciliationSource]:
    async with AsyncSessionLocal() as db:
        return list(await reconciliation_repo.get_discrepancies(
            db, ctx.organization_id, tax_year,
        ))


async def auto_reconcile(
    ctx: RequestContext, tax_year: int,
) -> dict:
    """Automatically match 1099 sources against transaction totals by vendor."""
    async with unit_of_work() as db:
        sources = list(await reconciliation_repo.list_sources(
            db, ctx.organization_id, tax_year,
        ))

        sources_checked = 0
        auto_matched = 0
        discrepancies = 0

        # Load all vendor sums once (not per-source)
        vendor_totals = dict(await transaction_repo.sum_by_normalized_vendor_year(
            db, ctx.organization_id, tax_year,
        ))

        for source in sources:
            if source.status == "confirmed":
                continue
            sources_checked += 1

            if not source.issuer:
                continue

            normalized = normalize_vendor(source.issuer)
            txn_total = vendor_totals.get(normalized, Decimal("0"))

            if txn_total == Decimal("0"):
                continue

            await reconciliation_repo.update_matched_amount(db, source, txn_total)

            if source.reported_amount and abs(txn_total - source.reported_amount) < Decimal("1.00"):
                source.status = "matched"
                auto_matched += 1
            else:
                source.status = "partial"
                discrepancies += 1

    return {
        "sources_checked": sources_checked,
        "auto_matched": auto_matched,
        "discrepancies": discrepancies,
    }


async def create_match(
    ctx: RequestContext,
    source_id: uuid.UUID,
    booking_statement_id: uuid.UUID,
    matched_amount: Decimal,
) -> ReconciliationMatch:
    async with unit_of_work() as db:
        source = await reconciliation_repo.get_source_by_id(
            db, source_id, ctx.organization_id,
        )
        if not source:
            raise LookupError("Reconciliation source not found")

        booking_statement = await booking_statement_repo.get_by_id(
            db, booking_statement_id, ctx.organization_id,
        )
        if not booking_statement:
            raise LookupError("Booking statement not found")

        match = ReconciliationMatch(
            reconciliation_source_id=source_id,
            booking_statement_id=booking_statement_id,
            matched_amount=matched_amount,
        )
        created = await reconciliation_repo.create_match(db, match)
        new_matched = source.matched_amount + matched_amount
        await reconciliation_repo.update_matched_amount(db, source, new_matched)
        return created
