"""Does this organization own the listing it is naming?

Any row that carries a client-supplied ``listing_id`` needs this check. The
foreign key only proves the listing exists — it says nothing about who it
belongs to, so without this a caller can point their own inquiry or lease at
another tenant's listing, and every screen that joins through that link (the
inquiry inbox, the calendar, rent receipts) then shows the other tenant's
listing title and property name.

A predicate rather than a raiser so each domain keeps its own error type.
Mirrors ``services/properties/property_ownership.py``.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listings import listing_repo


async def owns_listing(
    db: AsyncSession, *, organization_id: uuid.UUID, listing_id: uuid.UUID,
) -> bool:
    """Is ``listing_id`` a live listing of this organization?"""
    return await listing_repo.get_by_id(db, listing_id, organization_id) is not None
