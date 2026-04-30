"""Dedup detection service — returns decisions, does NOT mutate state.

The orchestration layer (dedup_resolution_service) acts on these decisions.
"""
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.source_quality import QUALITY_GAP_THRESHOLD, source_quality_rank
from app.core.vendors import normalize_vendor
from app.models.transactions.transaction import Transaction
from app.repositories import extraction_repo, booking_statement_repo, transaction_repo

logger = logging.getLogger(__name__)

_TWO_PLACES = Decimal("0.01")

AUTO_RESOLVE_WINDOW_DAYS = 10
DETECTION_WINDOW_DAYS = 14


@dataclass
class DedupDecision:
    action: str  # "create" | "skip" | "replace" | "review"
    existing_transaction: Transaction | None = None
    reason: str = ""
    confidence: str = ""  # "high" | "medium" | "low"


async def evaluate_dedup(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str | None,
    doc_date: datetime | None,
    amount: Decimal | None,
    line_items: list | None,
    property_id: uuid.UUID | None,
    exclude_id: uuid.UUID | None = None,
    file_type: str | None = None,
    new_document_type: str | None = None,
) -> DedupDecision:
    """Evaluate dedup and return a decision without side effects."""

    # --- 1. Vendor + date matching (three-tier) ---
    existing: Transaction | None = None
    if vendor and doc_date:
        txn_date = doc_date.date() if hasattr(doc_date, "date") else doc_date

        # 1a. Strictest: vendor + date + amount + property → skip (exact match)
        if amount is not None:
            exact = await transaction_repo.find_exact_duplicate(
                db, organization_id, str(vendor), txn_date,
                abs(amount).quantize(_TWO_PLACES),
                property_id,
                exclude_id=exclude_id,
            )
            if exact:
                return DedupDecision(
                    action="skip",
                    existing_transaction=exact,
                    reason=f"Exact vendor+date+amount+property match: {vendor}",
                    confidence="high",
                )

        # 1b. Same vendor + date + property but different amount → review
        existing = await transaction_repo.find_duplicate_by_vendor_date(
            db, organization_id, str(vendor), txn_date, property_id,
            exclude_id=exclude_id,
        )
        if existing:
            amounts_match = (
                amount is not None
                and existing.amount is not None
                and abs(amount).quantize(_TWO_PLACES) == existing.amount.quantize(_TWO_PLACES)
            )
            if amounts_match:
                return DedupDecision(
                    action="skip",
                    existing_transaction=existing,
                    reason=f"Exact vendor+date+property match: {vendor}",
                    confidence="high",
                )
            # Same vendor+date+property, different amount
            same_property = (
                property_id is not None
                and existing.property_id is not None
                and property_id == existing.property_id
            )
            if same_property:
                return DedupDecision(
                    action="review",
                    existing_transaction=existing,
                    reason=f"Same vendor+date+property but amounts differ: existing=${existing.amount}, new=${amount}",
                    confidence="medium",
                )
            # 1c. Vendor+date match but different/no property → review with lower confidence
            return DedupDecision(
                action="review",
                existing_transaction=existing,
                reason=f"Same vendor+date but different properties: existing=${existing.amount}, new=${amount}",
                confidence="low",
            )

    # --- 2. Reservation code match ---
    if not existing:
        res_codes = [
            li.get("res_code")
            for li in (line_items or [])
            if isinstance(li, dict) and li.get("res_code")
        ]
        for rc in res_codes:
            bs = await booking_statement_repo.find_by_res_code(db, organization_id, rc)
            if bs and bs.transaction_id:
                existing = await transaction_repo.get_by_id(db, bs.transaction_id, organization_id)
                if existing:
                    amounts_match = (
                        amount is not None
                        and existing.amount is not None
                        and abs(amount).quantize(_TWO_PLACES) == existing.amount.quantize(_TWO_PLACES)
                    )
                    if amounts_match:
                        return DedupDecision(
                            action="skip",
                            existing_transaction=existing,
                            reason=f"Reservation code match: {rc}",
                            confidence="high",
                        )
                    return DedupDecision(
                        action="review",
                        existing_transaction=existing,
                        reason=f"Reservation code match ({rc}) but amounts differ: existing=${existing.amount}, new=${amount}",
                        confidence="medium",
                    )

    # --- 3. Amount + property + date window match ---
    if not existing and vendor and doc_date and amount is not None:
        txn_date = doc_date.date() if hasattr(doc_date, "date") else doc_date
        possible = await transaction_repo.find_possible_match_by_date_amount(
            db, organization_id, txn_date, abs(amount), property_id,
            exclude_id=exclude_id,
        )
        if possible:
            date_diff = abs((txn_date - possible.transaction_date).days)
            same_property = possible.property_id == property_id or property_id is None or possible.property_id is None

            # Different non-null properties → review
            if property_id and possible.property_id and property_id != possible.property_id:
                return DedupDecision(
                    action="review",
                    existing_transaction=possible,
                    reason=f"Same amount but different properties, {date_diff} days apart",
                    confidence="low",
                )

            # No property on either → review
            if not property_id and not possible.property_id:
                return DedupDecision(
                    action="review",
                    existing_transaction=possible,
                    reason=f"Same amount, no property on either, {date_diff} days apart",
                    confidence="low",
                )

            # Within auto-resolve window
            if date_diff <= AUTO_RESOLVE_WINDOW_DAYS and same_property:
                # Check source quality
                existing_doc_type = await _get_source_document_type(db, possible)
                new_quality = source_quality_rank(new_document_type or _file_type_to_doc_type(file_type))
                existing_quality = source_quality_rank(existing_doc_type)
                quality_gap = abs(new_quality - existing_quality)

                if quality_gap >= QUALITY_GAP_THRESHOLD:
                    if new_quality > existing_quality:
                        # Check if user has edited the existing transaction
                        if possible.status == "approved" and _has_user_edits(possible):
                            return DedupDecision(
                                action="review",
                                existing_transaction=possible,
                                reason=f"Higher quality source but existing has user edits, {date_diff} days apart",
                                confidence="medium",
                            )
                        return DedupDecision(
                            action="replace",
                            existing_transaction=possible,
                            reason=f"Higher quality source ({new_document_type or file_type} > {existing_doc_type}), {date_diff} days apart",
                            confidence="high",
                        )
                    else:
                        return DedupDecision(
                            action="skip",
                            existing_transaction=possible,
                            reason=f"Existing has higher quality source ({existing_doc_type}), {date_diff} days apart",
                            confidence="high",
                        )

                # Same quality tier — check if vendors match (corroborating sources)
                if vendor and possible.vendor and normalize_vendor(vendor) == normalize_vendor(possible.vendor):
                    return DedupDecision(
                        action="skip",
                        existing_transaction=possible,
                        reason=f"Same vendor, amount, and property from different sources, {date_diff} days apart",
                        confidence="high",
                    )

                return DedupDecision(
                    action="review",
                    existing_transaction=possible,
                    reason=f"Same amount, same quality tier, different vendors ({vendor} vs {possible.vendor}), {date_diff} days apart",
                    confidence="medium",
                )

            # Review band (11-14 days)
            if date_diff <= DETECTION_WINDOW_DAYS:
                return DedupDecision(
                    action="review",
                    existing_transaction=possible,
                    reason=f"Same amount, {date_diff} days apart — wider date gap, less confident",
                    confidence="low",
                )

    # No match — create
    return DedupDecision(action="create", reason="No matching transaction found")


async def _get_source_document_type(db: AsyncSession, txn: Transaction) -> str | None:
    """Get the document_type of the extraction that produced this transaction."""
    if not txn.extraction_id:
        return None
    return await extraction_repo.get_document_type(db, txn.extraction_id)


def _file_type_to_doc_type(file_type: str | None) -> str | None:
    """Map file_type to approximate document_type for quality ranking."""
    if file_type == "spreadsheet":
        return "statement"
    return None


def _has_user_edits(txn: Transaction) -> bool:
    """Check if a transaction has been manually edited by the user."""
    return txn.is_manual or bool(txn.duplicate_reviewed_at)
