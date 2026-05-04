"""Repository for ``application_contacts`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory.

Contacts do NOT have a soft-delete — they use hard delete per the data model
(only ``applications`` and ``documents`` carry ``deleted_at``).

IDOR guard: every delete/update that takes both a parent id (``application_id``)
and a child id (``contact_id``) filters by ALL three: ``id``, ``application_id``,
AND ``user_id``.  A malicious caller who knows a contact's UUID but does not
own the parent application cannot reach it.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application_contact import ApplicationContact


async def list_by_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[ApplicationContact]:
    """Return all contacts for an application, scoped to ``user_id``.

    Filters by both ``user_id`` and ``application_id`` — defense in depth so
    a caller who passes another user's ``application_id`` sees an empty list.
    The route layer's parent-application existence check is the primary
    no-leak boundary; this is the secondary guard.
    """
    result = await db.execute(
        select(ApplicationContact)
        .where(
            ApplicationContact.user_id == user_id,
            ApplicationContact.application_id == application_id,
        )
        .order_by(ApplicationContact.created_at.asc()),
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    contact_id: uuid.UUID,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ApplicationContact | None:
    """Return a contact iff it belongs to the given application and user.

    Composite WHERE: ``id`` AND ``application_id`` AND ``user_id`` — all three
    must match.  This is the IDOR guard per PR #172 pattern.  If any one of
    the three fails to match, the row is invisible (returns ``None``).
    """
    result = await db.execute(
        select(ApplicationContact).where(
            ApplicationContact.id == contact_id,
            ApplicationContact.application_id == application_id,
            ApplicationContact.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    contact: ApplicationContact,
) -> ApplicationContact:
    """Persist a new ``ApplicationContact``.

    The caller (service layer) is responsible for setting ``user_id`` and
    ``application_id`` from the validated request context. The repo
    intentionally takes a fully-constructed ORM instance — keeps
    field-validation surface in one place (schema + service).
    """
    db.add(contact)
    await db.flush()
    await db.refresh(contact)
    return contact


async def delete(db: AsyncSession, contact: ApplicationContact) -> None:
    """Hard-delete an ``ApplicationContact``.

    Contacts use hard delete (no ``deleted_at`` column) per the data model.
    """
    await db.delete(contact)
    await db.flush()
