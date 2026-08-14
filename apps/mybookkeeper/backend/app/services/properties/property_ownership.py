"""Does this organization own the property it is naming?

Any row that carries a client-supplied ``property_id`` needs this check. The
foreign key only proves the property exists — it says nothing about who it
belongs to, so without this a caller can hang their own record off another
tenant's building, which both writes across the tenant boundary and confirms
that the id is real.

A predicate rather than a raiser so each domain keeps its own error type, and
the 422 the operator sees names the field they actually sent. Mirrors
``services/documents/document_ownership.py``, which exists for the same reason.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.properties import property_repo


async def owns_property(
    db: AsyncSession, *, organization_id: uuid.UUID, property_id: uuid.UUID,
) -> bool:
    return await property_repo.get_by_id(db, property_id, organization_id) is not None
