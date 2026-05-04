"""Rent-payment attribution service.

Matches a ``payer_name`` extracted from an email to a ``lease_signed``
applicant and either:
  - auto-confirms (exact case-insensitive match), or
  - queues for host review (Levenshtein ≤ 2 fuzzy match), or
  - queues as unmatched (no candidate found).

Airbnb payouts with the ``Properties/airbnb reservation`` Gmail label are
auto-attributed to the matching listing / property when exactly one Airbnb
listing is linked to the account; otherwise queued for review.
"""
import logging
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.applicants.applicant import Applicant
from app.models.transactions.transaction import Transaction
from app.repositories import attribution_repo
from app.repositories.applicants import applicant_repo
from app.repositories.leases import signed_lease_repo
from app.repositories.listings import listing_repo
from app.repositories import transaction_repo as txn_repo

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pure helpers (no DB I/O — unit-testable without async fixtures)
# ---------------------------------------------------------------------------

def _levenshtein(a: str, b: str) -> int:
    """Compute the Levenshtein edit distance between two strings."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def find_best_match(
    payer_name: str,
    candidates: Sequence[Applicant],
) -> tuple[Applicant | None, str | None]:
    """Return (best_applicant, confidence) for ``payer_name``.

    Confidence values:
      - ``"auto_exact"``  — case-insensitive exact match
      - ``"fuzzy"``       — Levenshtein ≤ 2, no exact match
      - ``None``          — no acceptable match found (returns (None, None))
    """
    if not payer_name:
        return None, None

    lower = payer_name.lower().strip()

    # Pass 1 — exact (case-insensitive)
    for applicant in candidates:
        if applicant.legal_name and applicant.legal_name.lower().strip() == lower:
            return applicant, "auto_exact"

    # Pass 2 — fuzzy (Levenshtein ≤ 2)
    best: Applicant | None = None
    best_dist = 3  # exclusive upper bound
    for applicant in candidates:
        if not applicant.legal_name:
            continue
        dist = _levenshtein(lower, applicant.legal_name.lower().strip())
        if dist < best_dist:
            best_dist = dist
            best = applicant

    if best is not None and best_dist <= 2:
        return best, "fuzzy"

    return None, None


# ---------------------------------------------------------------------------
# DB-aware helpers
# ---------------------------------------------------------------------------

async def _get_lease_signed_applicants(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[Applicant]:
    """Fetch all active lease_signed applicants for the org/user."""
    return await applicant_repo.list_for_user(
        db,
        organization_id=organization_id,
        user_id=user_id,
        stage="lease_signed",
        include_deleted=False,
        limit=500,
        offset=0,
    )


async def _get_property_id_for_applicant(
    db: AsyncSession,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """Resolve the property_id linked to an applicant via their signed lease.

    Walks: applicant → signed_lease → listing → property_id.
    Returns the first non-null property_id found, or None.
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=applicant.user_id,
        organization_id=organization_id,
        applicant_id=applicant.id,
        include_deleted=False,
        limit=5,
    )
    for lease in leases:
        if not lease.listing_id:
            continue
        listing = await listing_repo.get_by_id(db, lease.listing_id, organization_id)
        if listing and listing.property_id:
            return listing.property_id
    return None


# ---------------------------------------------------------------------------
# Main attribution entry-point (called from extraction_persistence)
# ---------------------------------------------------------------------------

async def maybe_attribute_payment(
    db: AsyncSession,
    *,
    txn: Transaction,
    payer_name: str | None,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    is_airbnb_label: bool = False,
) -> None:
    """Attempt to attribute a newly-created transaction to a tenant.

    Mutates ``txn`` in-place if an exact match is found. Writes to the review
    queue for fuzzy / unmatched / Airbnb-multi-listing cases. All writes are
    flushed into the caller's session; the caller owns the commit.

    This function is idempotent — it silently skips if the transaction already
    has an ``applicant_id`` set.
    """
    if txn.applicant_id is not None:
        return  # already attributed

    # --- Airbnb payout path ---------------------------------------------------
    if is_airbnb_label:
        await _attribute_airbnb_payout(db, txn=txn, organization_id=organization_id, user_id=user_id)
        return

    if not payer_name:
        return  # nothing to match

    # Store payer_name on the transaction for future re-attribution
    txn.payer_name = payer_name

    applicants = await _get_lease_signed_applicants(db, organization_id=organization_id, user_id=user_id)
    best, confidence = find_best_match(payer_name, applicants)

    if confidence == "auto_exact" and best is not None:
        property_id = await _get_property_id_for_applicant(db, best, organization_id)
        txn.applicant_id = best.id
        txn.attribution_source = "auto_exact"
        txn.category = "rental_revenue"
        if property_id and txn.property_id is None:
            txn.property_id = property_id
        logger.info(
            "Auto-attributed transaction %s to applicant %s (exact match)",
            txn.id, best.id,
        )
        return

    # Queue for review — fuzzy or unmatched
    proposed_applicant_id = best.id if best is not None else None
    queue_confidence = confidence if confidence in ("fuzzy",) else "unmatched"
    await attribution_repo.create(
        db,
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=txn.id,
        proposed_applicant_id=proposed_applicant_id,
        confidence=queue_confidence,
    )
    logger.info(
        "Queued transaction %s for attribution review (confidence=%s, proposed=%s)",
        txn.id, queue_confidence, proposed_applicant_id,
    )


async def _attribute_airbnb_payout(
    db: AsyncSession,
    *,
    txn: Transaction,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Auto-attribute an Airbnb-labelled payout to the linked listing's property.

    If the user has exactly one Airbnb listing, auto-attribute to it.
    Otherwise, queue for review as "unmatched".
    """
    airbnb_listings = await listing_repo.list_by_channel(
        db,
        organization_id=organization_id,
        user_id=user_id,
        channel="airbnb",
    )

    if len(airbnb_listings) == 1:
        listing = airbnb_listings[0]
        if listing.property_id and txn.property_id is None:
            txn.property_id = listing.property_id
        txn.attribution_source = "auto_exact"
        txn.category = "rental_revenue"
        logger.info(
            "Auto-attributed Airbnb payout %s to listing %s / property %s",
            txn.id, listing.id, listing.property_id,
        )
        return

    # Multiple or zero listings — queue for review
    await attribution_repo.create(
        db,
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    logger.info(
        "Queued Airbnb payout %s for review (%d listings found)",
        txn.id, len(airbnb_listings),
    )


# ---------------------------------------------------------------------------
# API-level service functions
# ---------------------------------------------------------------------------

async def list_review_queue(
    *,
    organization_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list:
    async with AsyncSessionLocal() as db:
        return list(await attribution_repo.list_pending(
            db, organization_id, limit=limit, offset=offset,
        ))


async def count_pending_reviews(organization_id: uuid.UUID) -> int:
    async with AsyncSessionLocal() as db:
        return await attribution_repo.count_pending(db, organization_id)


async def confirm_review(
    *,
    review_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
) -> dict:
    """Confirm a review queue item.

    If ``applicant_id`` is provided it overrides ``proposed_applicant_id``
    (supports "Pick a different tenant" flow). Uses the proposed candidate
    otherwise.

    Mutates the linked transaction: sets applicant_id, category=rental_revenue,
    attribution_source=auto_fuzzy_confirmed, and property_id if resolvable.
    """
    async with unit_of_work() as db:
        row = await attribution_repo.get_by_id(db, review_id, organization_id)
        if not row:
            raise ValueError("Review item not found")
        if row.status != "pending":
            raise ValueError("Review item is already resolved")

        chosen_applicant_id = applicant_id or row.proposed_applicant_id
        if not chosen_applicant_id:
            raise ValueError("No applicant specified and no proposed candidate")

        # Fetch the applicant to verify it belongs to this org
        applicant = await applicant_repo.get(
            db,
            applicant_id=chosen_applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if not applicant:
            raise ValueError("Applicant not found")

        # Update the transaction
        txn = await txn_repo.get_by_id(db, row.transaction_id, organization_id)
        if not txn:
            raise ValueError("Transaction not found")

        txn.applicant_id = applicant.id
        txn.attribution_source = "auto_fuzzy_confirmed"
        txn.category = "rental_revenue"

        # Resolve property from applicant's active lease if not already set
        if txn.property_id is None:
            property_id = await _get_property_id_for_applicant(db, applicant, organization_id)
            if property_id:
                txn.property_id = property_id

        await attribution_repo.resolve(db, row, "confirmed")
        return {"ok": True, "transaction_id": str(txn.id)}


async def reject_review(
    *,
    review_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> dict:
    """Reject a review queue item — transaction stays generic."""
    async with unit_of_work() as db:
        row = await attribution_repo.get_by_id(db, review_id, organization_id)
        if not row:
            raise ValueError("Review item not found")
        if row.status != "pending":
            raise ValueError("Review item is already resolved")
        await attribution_repo.resolve(db, row, "rejected")
        return {"ok": True}


async def attribute_manually(
    *,
    transaction_id: uuid.UUID,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Manually attribute a transaction to an applicant."""
    async with unit_of_work() as db:
        txn = await txn_repo.get_by_id(db, transaction_id, organization_id)
        if not txn:
            raise ValueError("Transaction not found")

        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if not applicant:
            raise ValueError("Applicant not found")

        txn.applicant_id = applicant.id
        txn.attribution_source = "manual"
        txn.category = "rental_revenue"

        if txn.property_id is None:
            property_id = await _get_property_id_for_applicant(db, applicant, organization_id)
            if property_id:
                txn.property_id = property_id

        return {"ok": True, "transaction_id": str(txn.id)}
