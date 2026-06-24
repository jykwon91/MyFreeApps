"""Repository for ``utility_account_link`` — learned utility account -> property.

All queries filter by ``organization_id`` for tenant isolation. The lookup key
is the unique triple ``(organization_id, sender_domain, account_number)``;
``sender_domain`` and ``account_number`` are normalized by the service
(``utility_account_service``) BEFORE they reach this layer, so a learn-write and
a lookup compare the same key.

Upsert strategy: select-then-insert/update (mirrors ``payer_alias_repo.upsert``)
rather than a Postgres-only ``on_conflict_do_update``. This keeps the repo a
straightforward, single upsert that behaves identically on SQLite (tests) and
PostgreSQL (prod), and lets the "manual_link is authoritative" rule live cleanly
in the service (which decides whether to call this at all) instead of leaking a
conditional ``WHERE`` into a dialect-specific ``DO UPDATE``.
"""
import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.utility_account_link import UtilityAccountLink


async def get_by_account(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    sender_domain: str,
    account_number: str,
) -> UtilityAccountLink | None:
    """Return the link for (org, sender_domain, account_number), or None.

    Selects on the unique triple. Callers pass already-normalized values — the
    service applies the same normalization on learn-write and lookup so the
    equality match holds.
    """
    result = await db.execute(
        select(UtilityAccountLink).where(
            UtilityAccountLink.organization_id == organization_id,
            UtilityAccountLink.sender_domain == sender_domain,
            UtilityAccountLink.account_number == account_number,
        )
    )
    return result.scalar_one_or_none()


async def upsert_link(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    sender_domain: str,
    account_number: str,
    property_id: uuid.UUID,
    source: str,
    provider_label: str | None = None,
) -> UtilityAccountLink:
    """Insert a link, or update the existing row for the unique triple.

    Re-learning the SAME account for the SAME property touches the existing row
    (and refreshes ``source`` / ``provider_label``); re-learning it for a
    DIFFERENT property updates ``property_id`` (the account moved to a new
    property). The "don't clobber a manual_link with an auto_learn" rule is
    enforced in the service before this is called.
    """
    existing = await get_by_account(
        db,
        organization_id=organization_id,
        sender_domain=sender_domain,
        account_number=account_number,
    )
    if existing is not None:
        existing.property_id = property_id
        existing.source = source
        if provider_label is not None:
            existing.provider_label = provider_label
        await db.flush()
        return existing

    row = UtilityAccountLink(
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        sender_domain=sender_domain,
        account_number=account_number,
        provider_label=provider_label,
        source=source,
    )
    db.add(row)
    await db.flush()
    return row


async def list_by_property(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
) -> Sequence[UtilityAccountLink]:
    """Return every learned account link for a property in this org.

    Supports a future UI that lists the utility accounts tied to a property.
    """
    result = await db.execute(
        select(UtilityAccountLink).where(
            UtilityAccountLink.organization_id == organization_id,
            UtilityAccountLink.property_id == property_id,
        )
    )
    return result.scalars().all()
