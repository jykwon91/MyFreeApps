"""Year-end statement reconciliation — matches reservation codes against existing documents."""
import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.parsers import safe_date, safe_decimal
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.responses.upload_result import ReconciliationItem
from app.repositories import reconciliation_repo, reservation_repo
from app.mappers.reservation_mapper import build_reservation_from_line_item

logger = logging.getLogger(__name__)


async def reconcile_year_end(
    reservations: list[dict[str, str]],
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    extraction_id: uuid.UUID,
    db: AsyncSession,
) -> list[ReconciliationItem]:
    """Match year-end statement reservations against existing documents.

    For each reservation, checks if a document with that res_code exists,
    then compares expected vs actual earnings.

    Also creates ReconciliationSource, Reservation, and
    ReconciliationMatch rows in the financial tables.
    """
    items: list[ReconciliationItem] = []

    # Determine tax_year from the first reservation with a date
    tax_year: int | None = None
    for res in reservations:
        check_in = safe_date(res.get("check_in"))
        if check_in:
            tax_year = check_in.year
            break
    if tax_year is None:
        tax_year = 2025  # fallback

    # Create or update ReconciliationSource for the year-end statement
    total_reported = Decimal("0")
    for res in reservations:
        amt = safe_decimal(res.get("net_client_earnings") or res.get("booking_revenue"))
        if amt:
            total_reported += amt

    existing_source = await reconciliation_repo.find_by_document(db, document_id)
    if existing_source:
        recon_source = existing_source
        recon_source.reported_amount = total_reported if total_reported > 0 else Decimal("0.01")
    else:
        recon_source = ReconciliationSource(
            organization_id=organization_id,
            user_id=user_id,
            document_id=document_id,
            source_type="year_end_statement",
            tax_year=tax_year,
            reported_amount=total_reported if total_reported > 0 else Decimal("0.01"),
        )
        await reconciliation_repo.create_source(db, recon_source)

    total_matched = Decimal("0")

    for res in reservations:
        res_code = res.get("res_code", "")
        if not res_code:
            continue

        expected = res.get("net_client_earnings") or res.get("booking_revenue")
        expected_dec = safe_decimal(expected)

        # Upsert Reservation row
        existing_res = await reservation_repo.find_by_res_code(db, organization_id, res_code)
        if not existing_res:
            new_res = build_reservation_from_line_item(res, organization_id)
            if new_res:
                new_res.res_code = res_code
                try:
                    async with db.begin_nested():
                        existing_res = await reservation_repo.create(db, new_res)
                except Exception:
                    logger.warning("Skipped duplicate reservation %s during reconciliation", res_code)

        matched_res = existing_res or await reservation_repo.find_by_res_code(db, organization_id, res_code)
        if not matched_res:
            items.append(ReconciliationItem(
                res_code=res_code,
                billing_period=res.get("billing_period"),
                status="missing",
                expected_earnings=expected,
            ))
            continue

        actual_dec = matched_res.net_client_earnings or matched_res.funds_due_to_client

        if expected_dec is not None and actual_dec is not None and expected_dec != actual_dec:
            status = "mismatch"
        else:
            status = "matched"

        if existing_res and actual_dec and actual_dec > 0:
            try:
                async with db.begin_nested():
                    match = ReconciliationMatch(
                        reconciliation_source_id=recon_source.id,
                        reservation_id=existing_res.id,
                        matched_amount=actual_dec,
                    )
                    await reconciliation_repo.create_match(db, match)
                total_matched += actual_dec
            except Exception:
                logger.warning("Skipped reconciliation match for %s", res_code)

        items.append(ReconciliationItem(
            res_code=res_code,
            billing_period=res.get("billing_period"),
            status=status,
            expected_earnings=expected,
            actual_earnings=str(actual_dec) if actual_dec else None,
        ))

    # Update the reconciliation source with matched totals
    await reconciliation_repo.update_matched_amount(db, recon_source, total_matched)

    return items
