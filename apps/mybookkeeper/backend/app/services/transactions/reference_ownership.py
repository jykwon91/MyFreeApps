"""Reject a property, activity, vendor or account the caller does not own.

``property_id``, ``activity_id`` and ``vendor_id`` arrive straight from the
client. The foreign keys only prove the rows exist, so without this check one
tenant could attach another tenant's property to a transaction, an import, an
upload or a classification rule — and the rule would then stamp it onto every
transaction it matches. Raised as ``ForeignReferenceError`` (a ``ValueError``)
so the API answers 422, like every other rejected payload.
"""
import uuid
from typing import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import activity_repo
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.properties import property_repo
from app.repositories.vendors import vendor_repo
from app.services.transactions.foreign_reference_error import ForeignReferenceError


async def assert_references_owned(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    fields: Mapping[str, object],
) -> None:
    property_id = fields.get("property_id")
    if isinstance(property_id, uuid.UUID) and await property_repo.get_by_id(
        db, property_id, organization_id,
    ) is None:
        raise ForeignReferenceError("property_id does not name a property")

    activity_id = fields.get("activity_id")
    if isinstance(activity_id, uuid.UUID) and await activity_repo.get_by_id(
        db, activity_id, organization_id,
    ) is None:
        raise ForeignReferenceError("activity_id does not name an activity")

    vendor_id = fields.get("vendor_id")
    if isinstance(vendor_id, uuid.UUID) and await vendor_repo.get_by_id(
        db,
        vendor_id=vendor_id,
        organization_id=organization_id,
        user_id=user_id,
    ) is None:
        raise ForeignReferenceError("vendor_id does not name a vendor")

    # Accounts are one person's, like vendors: org AND user.
    for field in ("account_id", "transfer_to_account_id"):
        account_id = fields.get(field)
        if isinstance(account_id, uuid.UUID) and await financial_account_repo.get(
            db,
            account_id=account_id,
            user_id=user_id,
            organization_id=organization_id,
        ) is None:
            raise ForeignReferenceError(f"{field} does not name an account")
