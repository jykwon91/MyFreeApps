"""Bank CSV import business logic."""
import uuid
from collections.abc import Sequence

from app.core.context import RequestContext
from app.db.session import unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories.transactions import transaction_repo
from app.schemas.transactions.imports import ImportResult, TransactionPreview
from app.services.transactions.bank_csv_parser import detect_bank_format, parse_bank_csv

MAX_CSV_SIZE = 5 * 1024 * 1024  # 5 MB


async def import_bank_csv_file(
    ctx: RequestContext,
    content_bytes: bytes,
    filename: str,
    property_id: uuid.UUID | None,
) -> ImportResult:
    """Parse a bank CSV and import non-duplicate transactions.

    Returns:
        ImportResult with counts and preview of parsed transactions.

    Raises:
        ValueError: If file is too large, not a CSV, unrecognized format, or empty.
    """
    if not filename.lower().endswith(".csv"):
        raise ValueError("File must be a CSV")

    if len(content_bytes) > MAX_CSV_SIZE:
        raise ValueError("File too large (max 5MB)")

    content = content_bytes.decode("utf-8", errors="replace")
    fmt = detect_bank_format(content)
    if fmt == "unknown":
        raise ValueError("Could not detect bank CSV format")

    parsed = parse_bank_csv(content, ctx.organization_id, ctx.user_id, property_id)
    if not parsed:
        raise ValueError("No transactions found in CSV")

    external_ids = [t.external_id for t in parsed if t.external_id]
    imported = 0
    skipped = 0

    async with unit_of_work() as db:
        existing_ids = await transaction_repo.get_existing_external_ids(
            db, ctx.organization_id, "bank_csv", external_ids,
        )

        for txn in parsed:
            if txn.external_id in existing_ids:
                skipped += 1
                continue
            await transaction_repo.create(db, txn)
            imported += 1

    preview = [
        TransactionPreview(
            date=str(t.transaction_date),
            vendor=t.vendor,
            amount=f"{t.amount:.2f}",
            transaction_type=t.transaction_type,
            category=t.category,
        )
        for t in parsed[:5]
    ]

    return ImportResult(
        imported=imported,
        skipped_duplicates=skipped,
        format_detected=fmt,
        preview=preview,
    )
