"""Rent-payment attribution service.

Matches a ``payer_name`` extracted from an email to a ``lease_signed``
applicant and either:
  - auto-confirms (exact case-insensitive match), or
  - queues for host review (Levenshtein ≤ 2 fuzzy match), or
  - queues as unmatched (no candidate found).

Airbnb payouts are attributed via the cascade in ``airbnb_payout_matcher``
(res_code → property auto; single linked listing auto; listing-title-in-text
→ propose; else unmatched); non-auto outcomes go to the review queue, where
the operator resolves them via the property-confirm path.
"""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import attribution_repo
from app.repositories import payer_alias_repo
from app.repositories import booking_statement_repo
from app.repositories.applicants import applicant_repo
from app.repositories.listings import listing_repo
from app.repositories.properties import property_repo
from app.repositories import transaction_repo as txn_repo
from app.services.leases import receipt_service
from app.services.transactions.airbnb_payout_matcher import (
    decide_airbnb_attribution,
    parse_res_code,
)
from app.services.transactions.attribution_helpers import (
    _get_lease_signed_applicants,
    _get_property_id_for_applicant,
)
from app.services.transactions.attribution_matcher import find_best_match, resolve_alias

logger = logging.getLogger(__name__)


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
    is_airbnb_payout: bool = False,
    payer_handle: str | None = None,
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

    # Attribution links a rent *payment* (or payout) to a tenant/property and
    # stamps category="rental_revenue". It must never run on an expense — e.g.
    # a management-commission line on a property-management statement — or the
    # row ends up transaction_type="expense" + category="rental_revenue" and
    # violates the chk_txn_type_category constraint at insert time, failing the
    # whole sync item.
    if txn.transaction_type != "income":
        return

    # --- Airbnb payout path ---------------------------------------------------
    if is_airbnb_payout:
        await _attribute_airbnb_payout(db, txn=txn, organization_id=organization_id, user_id=user_id)
        return

    if not payer_name:
        return  # nothing to match

    # Store payer_name + handle on the transaction for future re-attribution
    # (confirm / manual-link read them back to seed the learned alias).
    txn.payer_name = payer_name
    txn.payer_handle = payer_handle

    # Pass 0 — learned alias. A payer the host previously confirmed / linked to
    # a tenant auto-attributes without review ("remember for next time"). This
    # runs BEFORE name matching and captures payers whose name differs from the
    # tenant's (a relative paying rent) — exactly what find_best_match can't do.
    aliases = await payer_alias_repo.list_by_payer_name(
        db, organization_id=organization_id, payer_name=payer_name
    )
    alias_applicant_id, alias_outcome = resolve_alias(aliases, payer_handle)

    if alias_outcome == "ambiguous":
        # The payer name maps to more than one tenant and the handle (if any)
        # can't disambiguate. Refuse to guess — queue for manual review, the
        # same guard find_best_match applies to same-named tenants.
        logger.warning(
            "Ambiguous payer alias for txn %s: payer_name=%r (handle=%r) maps "
            "to multiple tenants — queuing for manual review instead of "
            "auto-attributing.",
            txn.id, payer_name, payer_handle,
        )
        await attribution_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            transaction_id=txn.id,
            proposed_applicant_id=None,
            confidence="unmatched",
        )
        return

    if alias_outcome == "alias" and alias_applicant_id is not None:
        applicant = await applicant_repo.get(
            db,
            applicant_id=alias_applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is not None:
            property_id = await _get_property_id_for_applicant(db, applicant, organization_id)
            txn.applicant_id = applicant.id
            txn.attribution_source = "auto_alias"
            txn.category = "rental_revenue"
            # Auto-attributing a payment verifies it — promote out of the
            # unverified state so it counts in the dashboard, exactly as the
            # manual confirm/link paths do.
            txn.status = "approved"
            if property_id and txn.property_id is None:
                txn.property_id = property_id
            logger.info(
                "Auto-attributed transaction %s to applicant %s via learned "
                "payer alias", txn.id, applicant.id,
            )
            await receipt_service.create_pending_receipt_in_session(
                db,
                transaction_id=txn.id,
                applicant_id=applicant.id,
                user_id=user_id,
                organization_id=organization_id,
            )
            return
        # Alias points to a missing/deleted applicant — ignore it and fall
        # through to name matching rather than attributing to a stale tenant.
        logger.warning(
            "Payer alias for txn %s points to missing applicant %s — ignoring",
            txn.id, alias_applicant_id,
        )

    applicants = await _get_lease_signed_applicants(db, organization_id=organization_id, user_id=user_id)
    best, confidence = find_best_match(payer_name, applicants)

    if confidence == "ambiguous":
        # Two or more lease_signed tenants share this name — refuse to guess.
        # Falls through to the review queue (proposed_applicant_id=None,
        # queued "unmatched") so the host disambiguates via the picker rather
        # than the payment silently landing on the wrong same-named tenant.
        logger.warning(
            "Ambiguous attribution for txn %s: payer_name=%r matches multiple "
            "lease_signed tenants by name — queuing for manual review instead "
            "of auto-attributing.",
            txn.id, payer_name,
        )

    if confidence == "auto_exact" and best is not None:
        property_id = await _get_property_id_for_applicant(db, best, organization_id)
        txn.applicant_id = best.id
        txn.attribution_source = "auto_exact"
        txn.category = "rental_revenue"
        # Auto-attributing a payment verifies it (see auto_alias branch above).
        txn.status = "approved"
        if property_id and txn.property_id is None:
            txn.property_id = property_id
        logger.info(
            "Auto-attributed transaction %s to applicant %s (exact match)",
            txn.id, best.id,
        )
        await receipt_service.create_pending_receipt_in_session(
            db,
            transaction_id=txn.id,
            applicant_id=best.id,
            user_id=user_id,
            organization_id=organization_id,
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
    """Attribute an Airbnb payout to a property via the matcher cascade.

    res_code→property and single-linked-listing auto-attribute; a listing
    title found in the payout text is proposed for review; anything else is
    queued unmatched. See ``airbnb_payout_matcher``.
    """
    airbnb_listings = await listing_repo.list_by_channel(
        db,
        organization_id=organization_id,
        user_id=user_id,
        channel="airbnb",
    )

    res_code = parse_res_code(txn.description)
    stmt = (
        await booking_statement_repo.find_by_res_code(db, organization_id, res_code)
        if res_code
        else None
    )
    match = decide_airbnb_attribution(
        res_code_property_id=stmt.property_id if stmt else None,
        airbnb_listings=airbnb_listings,
        txn_description=txn.description,
        txn_address=txn.address,
    )

    if match.confidence == "auto":
        # decide_airbnb_attribution only returns "auto" with a non-None
        # property_id (both auto branches gate on `... is not None`).
        # Preserve the idempotency guard — never overwrite a set property_id.
        if txn.property_id is None:
            txn.property_id = match.property_id
        txn.attribution_source = "auto_exact"
        txn.category = "rental_revenue"
        # Auto-attributing a payout to a property verifies it (see the tenant
        # auto-attribution branches in maybe_attribute_payment).
        txn.status = "approved"
        logger.info(
            "Auto-attributed Airbnb payout %s to property %s (res_code=%s)",
            txn.id, match.property_id, res_code,
        )
        return

    if match.confidence == "propose":
        await attribution_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            transaction_id=txn.id,
            proposed_applicant_id=None,
            proposed_property_id=match.property_id,
            confidence="fuzzy",
        )
        logger.info(
            "Queued Airbnb payout %s for review with proposed property %s",
            txn.id, match.property_id,
        )
        return

    # Unmatched — queue for review with no proposal
    await attribution_repo.create(
        db,
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    logger.info(
        "Queued Airbnb payout %s for review (unmatched; %d airbnb listings)",
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
    property_id: uuid.UUID | None = None,
) -> dict:
    """Confirm a review queue item against an applicant OR a property.

    Two attribution targets are supported:
      - **applicant** (tenant rent) — sets ``txn.applicant_id`` and creates a
        pending receipt. ``applicant_id`` overrides ``proposed_applicant_id``
        ("pick a different tenant").
      - **property** (Airbnb payout — no tenant) — sets ``txn.property_id``
        only; no receipt (an Airbnb payout has no tenant to receipt).
        ``property_id`` overrides ``proposed_property_id``.

    The applicant target takes precedence: the property path is only taken
    when there is no chosen applicant (a row never has both in practice; this
    branch order makes the resolution deterministic if it ever does).

    Mutates the linked transaction and sets category=rental_revenue.
    """
    async with unit_of_work() as db:
        row = await attribution_repo.get_by_id(db, review_id, organization_id)
        if not row:
            raise ValueError("Review item not found")
        if row.status != "pending":
            raise ValueError("Review item is already resolved")

        txn = await txn_repo.get_by_id(db, row.transaction_id, organization_id)
        if not txn:
            raise ValueError("Transaction not found")

        chosen_applicant_id = applicant_id or row.proposed_applicant_id
        if chosen_applicant_id:
            # Fetch the applicant to verify it belongs to this org
            applicant = await applicant_repo.get(
                db,
                applicant_id=chosen_applicant_id,
                organization_id=organization_id,
                user_id=user_id,
            )
            if not applicant:
                raise ValueError("Applicant not found")

            txn.applicant_id = applicant.id
            txn.attribution_source = "auto_fuzzy_confirmed"
            txn.category = "rental_revenue"
            # Confirming an attribution verifies the payment — promote it out of
            # the pending / unverified review state so it counts in the dashboard.
            txn.status = "approved"

            # Resolve property from applicant's active lease if not already set
            if txn.property_id is None:
                resolved_property_id = await _get_property_id_for_applicant(
                    db, applicant, organization_id
                )
                if resolved_property_id:
                    txn.property_id = resolved_property_id

            await attribution_repo.resolve(db, row, "confirmed")
            await receipt_service.create_pending_receipt_in_session(
                db,
                transaction_id=txn.id,
                applicant_id=applicant.id,
                user_id=user_id,
                organization_id=organization_id,
            )
            # Remember this payer -> tenant so future payments from the same
            # payer auto-attribute (Pass 0 in maybe_attribute_payment). The
            # handle (when the original notification carried one) disambiguates
            # this tenant from a different person who shares the payer's name.
            if txn.payer_name:
                await payer_alias_repo.upsert(
                    db,
                    user_id=user_id,
                    organization_id=organization_id,
                    payer_name=txn.payer_name,
                    applicant_id=applicant.id,
                    source="confirm",
                    payer_handle=txn.payer_handle,
                )
            return {"ok": True, "transaction_id": str(txn.id)}

        # Property path — Airbnb payout, no tenant. Fail closed: a bad or
        # cross-org property_id raises and leaves the row pending + txn untouched.
        chosen_property_id = property_id or row.proposed_property_id
        if chosen_property_id:
            prop = await property_repo.get_by_id(db, chosen_property_id, organization_id)
            if not prop:
                raise ValueError("Property not found")

            txn.property_id = prop.id
            # An Airbnb payout has no tenant — re-attributing to a property
            # must not leave a stale applicant link on the transaction.
            txn.applicant_id = None
            txn.attribution_source = "manual"
            txn.category = "rental_revenue"
            # Confirming the payout against a property verifies it.
            txn.status = "approved"
            await attribution_repo.resolve(db, row, "confirmed")
            return {"ok": True, "transaction_id": str(txn.id)}

        raise ValueError("No applicant or property specified and no proposed candidate")


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
    """Manually attribute a transaction to an applicant.

    If a pending review-queue row exists for this transaction (because the
    auto-pipeline previously couldn't decide), it is resolved as ``confirmed``
    in the same transaction so the host doesn't have to reject it separately.
    """
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
        # Manually linking a tenant verifies the payment — promote it to
        # approved so it counts in the dashboard.
        txn.status = "approved"

        if txn.property_id is None:
            property_id = await _get_property_id_for_applicant(db, applicant, organization_id)
            if property_id:
                txn.property_id = property_id

        review_row = await attribution_repo.get_by_transaction_id(
            db, transaction_id, organization_id
        )
        if review_row and review_row.status == "pending":
            await attribution_repo.resolve(db, review_row, status="confirmed")

        await receipt_service.create_pending_receipt_in_session(
            db,
            transaction_id=txn.id,
            applicant_id=applicant.id,
            user_id=user_id,
            organization_id=organization_id,
        )
        # Remember this payer -> tenant ("Link" is an explicit host association)
        # so future payments from the same payer auto-attribute. The handle
        # (when captured) disambiguates this tenant from a same-named payer.
        if txn.payer_name:
            await payer_alias_repo.upsert(
                db,
                user_id=user_id,
                organization_id=organization_id,
                payer_name=txn.payer_name,
                applicant_id=applicant.id,
                source="manual_link",
                payer_handle=txn.payer_handle,
            )
        return {"ok": True, "transaction_id": str(txn.id)}
