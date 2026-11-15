"""Attributes an Airbnb payout to a property via the ``airbnb_payout_matcher`` cascade.

Extracted from ``attribution_service`` (which calls it from
``maybe_attribute_payment``) so that module stays under the file-size growth guard.
Writes flush into the caller's session; the caller owns the commit.
"""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.transaction import Transaction
from app.repositories import attribution_repo
from app.repositories import booking_statement_repo
from app.repositories.listings import listing_repo
from app.services.transactions.airbnb_payout_matcher import (
    decide_airbnb_attribution,
    parse_res_code,
)

logger = logging.getLogger(__name__)


async def attribute_airbnb_payout(
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
