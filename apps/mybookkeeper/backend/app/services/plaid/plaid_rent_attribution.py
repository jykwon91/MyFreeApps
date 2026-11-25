"""File synced income from tenants as rent, the way emailed receipts are.

A bank row carries no payer field, only the bank's description, so the payer
name is read out of it (``bank_payer_name_parser``) and handed to the same
attribution every emailed Zelle receipt goes through: a learned alias or an
exact tenant name files it as that tenant's rent on their property; a near
match or an unknown sender goes to the rent review queue.

Runs after every sync over every synced income row not yet read, so rows a
sync added before this existed are triaged on the next sync too. Attribution
stores the payer name it read, so a row is read once.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.transactions import plaid_transaction_repo
from app.services.transactions.attribution_service import maybe_attribute_payment
from app.services.transactions.bank_payer_name_parser import parse_payer_name

logger = logging.getLogger(__name__)


async def attribute_untriaged_income(db: AsyncSession, *, organization_id: uuid.UUID) -> int:
    """Returns how many rows were filed as a tenant's rent."""
    attributed = 0
    for row in await plaid_transaction_repo.list_untriaged_income(db, organization_id=organization_id):
        payer_name = parse_payer_name(row.description)
        if payer_name is None:
            continue
        await maybe_attribute_payment(
            db, txn=row, payer_name=payer_name,
            organization_id=organization_id, user_id=row.user_id,
        )
        if row.applicant_id is not None:
            attributed += 1
    if attributed:
        logger.info("Filed %d synced payments as rent for org %s", attributed, organization_id)
    return attributed
