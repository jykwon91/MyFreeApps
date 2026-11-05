"""Which tax forms an organization should expect for a year, and whether it has them."""
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tax_constants import PLATFORM_1099K_ISSUERS
from app.core.vendors import normalize_vendor
from app.repositories import booking_statement_repo, property_repo, transaction_repo
from app.schemas.tax.source_document import ChecklistItem, TaxSourceDocument


def find_received(
    documents: Sequence[TaxSourceDocument],
    form_type: str,
    issuers: Sequence[str],
    unread: list[TaxSourceDocument],
) -> TaxSourceDocument | None:
    """The document that satisfies an expected form from one of `issuers`.

    Another issuer's copy of the same form doesn't count. One whose issuer couldn't be
    read does, since it may be the one expected, but it can only answer for one row, so
    it's taken out of `unread`.
    """
    names = [normalize_vendor(name) for name in issuers]
    for doc in documents:
        issuer = normalize_vendor(doc.issuer_name)
        if doc.document_type == form_type and issuer and any(name in issuer or issuer in name for name in names):
            return doc
    match = next((doc for doc in unread if doc.document_type == form_type), None)
    if match:
        unread.remove(match)
    return match


async def _platform_items(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    documents: Sequence[TaxSourceDocument],
    unread: list[TaxSourceDocument],
) -> list[ChecklistItem]:
    """A 1099-K per platform, except for properties a manager runs.

    The platform sends those to the manager. If no management fee names a property,
    there's no telling which ones those are, so the fees are taken to cover everything.
    """
    has_manager = await transaction_repo.count_by_category(
        db, organization_id, tax_year, "management_fee",
    ) > 0
    managed = await transaction_repo.distinct_property_ids_by_category(
        db, organization_id, tax_year, "management_fee",
    ) if has_manager else []
    if has_manager and not managed:
        return []

    platforms = await booking_statement_repo.distinct_platforms_for_year(
        db, organization_id, tax_year, excluding_property_ids=managed if has_manager else None,
    )
    items: list[ChecklistItem] = []
    for platform in platforms:
        known = PLATFORM_1099K_ISSUERS.get(platform)
        if known is None:
            continue
        label, issuers = known
        match = find_received(documents, "1099_k", issuers, unread)
        items.append(ChecklistItem(
            expected_type="1099_k",
            expected_from=label,
            reason=f"Reservations found on {label} platform",
            status="received" if match else "missing",
            document_id=match.document_id if match else None,
        ))
    return items


async def _manager_items(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    documents: Sequence[TaxSourceDocument],
    unread: list[TaxSourceDocument],
) -> list[ChecklistItem]:
    vendors = await transaction_repo.distinct_vendors_by_category(
        db, organization_id, tax_year, "management_fee",
    )
    items: list[ChecklistItem] = []
    for vendor in vendors:
        match = find_received(documents, "1099_misc", [vendor], unread)
        items.append(ChecklistItem(
            expected_type="1099_misc",
            expected_from=vendor,
            reason="Management fee transactions found",
            status="received" if match else "missing",
            document_id=match.document_id if match else None,
        ))
    return items


async def _mortgage_item(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    documents: Sequence[TaxSourceDocument],
) -> list[ChecklistItem]:
    """One row for all 1098s, counted against properties with mortgage interest.

    A 1098 isn't linked to a property, so when some are missing there's no telling
    which, and naming one property as received would be a guess. For the same reason
    a 1098 for a home that isn't a rental counts here too.
    """
    property_ids = await transaction_repo.distinct_property_ids_by_category(
        db, organization_id, tax_year, "mortgage_interest",
    )
    if not property_ids:
        return []

    properties = [await property_repo.get_by_id(db, prop_id, organization_id) for prop_id in property_ids]
    names = sorted(prop.name for prop in properties if prop is not None and prop.name)
    received = [doc for doc in documents if doc.document_type == "1098"]
    expected = len(property_ids)

    if names:
        listed = ", ".join(names[:-1]) + " and " + names[-1] if len(names) > 1 else names[0]
        reason = f"Mortgage interest transactions exist for {listed}"
    else:
        reason = "Mortgage interest transactions found"
    if expected > 1 and len(received) < expected:
        reason = f"{reason}. I have {len(received)} of {expected} 1098s"

    is_complete = len(received) >= expected
    return [ChecklistItem(
        expected_type="1098",
        expected_from=None,
        reason=reason,
        status="received" if is_complete else "missing",
        document_id=received[0].document_id if is_complete else None,
    )]


async def build_checklist(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    documents: Sequence[TaxSourceDocument],
) -> list[ChecklistItem]:
    unread = [doc for doc in documents if not doc.issuer_name]
    return [
        *await _platform_items(db, organization_id, tax_year, documents, unread),
        *await _manager_items(db, organization_id, tax_year, documents, unread),
        *await _mortgage_item(db, organization_id, tax_year, documents),
    ]
