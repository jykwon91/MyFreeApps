"""Discrepancy scanner — on-demand scan of a tax year's data for anomalies.

Detects: duplicate transactions, 1099 gaps, missing rental income, orphaned transactions.
All queries are read-only; no data is modified.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vendors import normalize_vendor
from app.db.session import AsyncSessionLocal
from app.repositories import (
    property_repo,
    reconciliation_repo,
    booking_statement_repo,
    tax_return_repo,
    transaction_repo,
)
from app.schemas.tax.discrepancy_scan import DiscrepancyItem, DiscrepancyScanResult

_GAP_THRESHOLD = Decimal("50")
_DUPLICATE_WINDOW_DAYS = 14


async def scan(
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
) -> DiscrepancyScanResult:
    """Scan a tax year's data and return all detected discrepancy items."""
    async with AsyncSessionLocal() as db:
        tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")

        tax_year = tax_return.tax_year

        items: list[DiscrepancyItem] = []
        items.extend(await _scan_duplicates(db, organization_id, tax_year))
        items.extend(await _scan_1099_gaps(db, organization_id, tax_year))
        items.extend(await _scan_missing_income(db, organization_id, tax_year))
        items.extend(await _scan_orphaned(db, organization_id, tax_year))

    summary = {
        "duplicates": sum(1 for i in items if i.category == "duplicate"),
        "1099_gaps": sum(1 for i in items if i.category == "1099_gap"),
        "missing_income": sum(1 for i in items if i.category == "missing_income"),
        "orphaned": sum(1 for i in items if i.category == "orphaned"),
    }

    return DiscrepancyScanResult(
        tax_return_id=tax_return_id,
        tax_year=tax_year,
        scanned_at=datetime.now(timezone.utc).isoformat(),
        items=items,
        summary=summary,
    )


async def _scan_duplicates(db: AsyncSession, organization_id: uuid.UUID, tax_year: int) -> list[DiscrepancyItem]:
    """Group approved transactions by (normalized_vendor, amount, property_id).

    Within each group, cluster by 14-day windows and flag clusters of 2 or more.
    """
    rows = await transaction_repo.list_for_duplicate_scan(db, organization_id, tax_year)
    if not rows:
        return []

    # Group by (normalized_vendor, amount, property_id)
    groups: dict[tuple[str, Decimal, uuid.UUID | None], list[Row]] = defaultdict(list)
    for row in rows:
        key = (row.normalized_vendor, row.amount, row.property_id)
        groups[key].append(row)

    items: list[DiscrepancyItem] = []
    for (vendor, amount, property_id), group_rows in groups.items():
        if len(group_rows) < 2:
            continue

        # Sort by date and cluster within 14-day windows
        sorted_rows = sorted(group_rows, key=lambda r: r.transaction_date)
        clusters: list[list[Row]] = []
        current_cluster = [sorted_rows[0]]

        for row in sorted_rows[1:]:
            days_diff = (row.transaction_date - current_cluster[-1].transaction_date).days
            if days_diff <= _DUPLICATE_WINDOW_DAYS:
                current_cluster.append(row)
            else:
                clusters.append(current_cluster)
                current_cluster = [row]
        clusters.append(current_cluster)

        for cluster in clusters:
            if len(cluster) < 2:
                continue
            affected_ids = [str(r.id) for r in cluster]
            prop_label = f" (property {property_id})" if property_id else ""
            items.append(
                DiscrepancyItem(
                    category="duplicate",
                    severity="high",
                    title=f"Possible duplicate: {vendor} — ${amount}",
                    description=(
                        f"{len(cluster)} transactions for '{vendor}' at ${amount}"
                        f"{prop_label} fall within a {_DUPLICATE_WINDOW_DAYS}-day window."
                    ),
                    affected_ids=affected_ids,
                    suggested_action="Review these transactions and delete any true duplicates.",
                )
            )

    return items


async def _scan_1099_gaps(db: AsyncSession, organization_id: uuid.UUID, tax_year: int) -> list[DiscrepancyItem]:
    """For each 1099 reconciliation source, compare reported amount against matched transactions."""
    sources = await reconciliation_repo.list_sources(db, organization_id, tax_year)
    if not sources:
        return []

    # Build a map of normalized_vendor -> sum from approved transactions
    vendor_totals: dict[str, Decimal] = {}
    for normalized_vendor_name, total in await transaction_repo.sum_by_normalized_vendor_year(
        db, organization_id, tax_year
    ):
        vendor_totals[normalized_vendor_name] = total

    items: list[DiscrepancyItem] = []
    for source in sources:
        if not source.issuer:
            continue

        normalized_issuer = normalize_vendor(source.issuer)
        matched_sum = vendor_totals.get(normalized_issuer, Decimal("0"))
        gap = source.reported_amount - matched_sum

        if gap > _GAP_THRESHOLD:
            items.append(
                DiscrepancyItem(
                    category="1099_gap",
                    severity="high",
                    title=f"1099 gap: {source.issuer}",
                    description=(
                        f"1099 reports ${source.reported_amount:.2f} from '{source.issuer}', "
                        f"but only ${matched_sum:.2f} found in approved transactions — "
                        f"a gap of ${gap:.2f}."
                    ),
                    affected_ids=[str(source.id)],
                    suggested_action=(
                        "Add or approve transactions to account for the missing amount, "
                        "or confirm the 1099 reported amount is correct."
                    ),
                )
            )

    return items


async def _scan_missing_income(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int
) -> list[DiscrepancyItem]:
    """Flag properties that have reservations but no rental_revenue transactions."""
    reservation_rows = await booking_statement_repo.summary_by_property_platform(
        db, organization_id, tax_year
    )
    if not reservation_rows:
        return []

    # Properties with at least one reservation this year
    property_ids_with_reservations: set[uuid.UUID] = {
        row.property_id for row in reservation_rows if row.property_id
    }
    if not property_ids_with_reservations:
        return []

    # Properties with approved income transactions
    income_rows = await transaction_repo.summary_by_property(
        db, organization_id, tax_year=tax_year
    )
    property_ids_with_income: set[uuid.UUID] = {
        row.property_id
        for row in income_rows
        if row.property_id and row.transaction_type == "income"
    }

    missing_property_ids = property_ids_with_reservations - property_ids_with_income
    if not missing_property_ids:
        return []

    prop_labels = await property_repo.get_labels_by_ids(db, list(missing_property_ids))

    items: list[DiscrepancyItem] = []
    for prop_id in missing_property_ids:
        label = prop_labels.get(prop_id, str(prop_id))
        items.append(
            DiscrepancyItem(
                category="missing_income",
                severity="medium",
                title=f"Missing income: {label}",
                description=(
                    f"Property '{label}' has reservations in {tax_year} "
                    f"but no approved rental income transactions."
                ),
                affected_ids=[str(prop_id)],
                suggested_action=(
                    "Add or approve rental income transactions for this property, "
                    "or verify that reservation data is accurate."
                ),
            )
        )

    return items


async def _scan_orphaned(db: AsyncSession, organization_id: uuid.UUID, tax_year: int) -> list[DiscrepancyItem]:
    """Find approved, tax-relevant transactions with no property_id and no activity_id."""
    orphans = await transaction_repo.list_orphaned_tax_relevant(db, organization_id, tax_year)
    if not orphans:
        return []

    affected_ids = [str(t.id) for t in orphans]
    return [
        DiscrepancyItem(
            category="orphaned",
            severity="low",
            title=f"{len(orphans)} orphaned transaction(s)",
            description=(
                f"{len(orphans)} approved, tax-relevant transaction(s) in {tax_year} "
                f"have no property or activity assigned."
            ),
            affected_ids=affected_ids,
            suggested_action=(
                "Assign each transaction to a property or activity so it is "
                "included in the correct tax schedule."
            ),
        )
    ]
