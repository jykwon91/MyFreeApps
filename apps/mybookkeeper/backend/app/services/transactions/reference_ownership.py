"""Reject a property or vendor the caller's organization does not own.

``property_id`` and ``vendor_id`` arrive straight from the client. The foreign
keys only prove the rows exist, so without this check one tenant could attach
another tenant's property to a transaction and teach classification rules
keyed to it. Raised as ``ValueError`` so the API answers 422, like every other
rejected transaction payload.
"""
import uuid
from typing import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.repositories.properties import property_repo
from app.repositories.vendors import vendor_repo


async def assert_references_owned(
    db: AsyncSession, ctx: RequestContext, fields: Mapping[str, object],
) -> None:
    property_id = fields.get("property_id")
    if isinstance(property_id, uuid.UUID) and await property_repo.get_by_id(
        db, property_id, ctx.organization_id,
    ) is None:
        raise ValueError("property_id does not name a property")

    vendor_id = fields.get("vendor_id")
    if isinstance(vendor_id, uuid.UUID) and await vendor_repo.get_by_id(
        db,
        vendor_id=vendor_id,
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
    ) is None:
        raise ValueError("vendor_id does not name a vendor")
