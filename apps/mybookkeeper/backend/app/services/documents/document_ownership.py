"""Does this organization own the document it is citing?

Any row that carries a ``source_document_id`` supplied by the client needs this
check. The foreign key only proves the document exists — ``documents`` is
global, so nothing at the database layer stops one tenant from naming another's
file as the source of a rate or a coverage limit, which would leak the fact
that the document exists and let a stale id survive a tenant boundary.

A predicate rather than a raiser so each domain keeps its own error type, and
the 422 the operator sees names the field they actually sent.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.documents import document_repo


async def owns_document(
    db: AsyncSession, *, organization_id: uuid.UUID, document_id: uuid.UUID,
) -> bool:
    return await document_repo.get_by_id(db, document_id, organization_id) is not None
