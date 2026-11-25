"""Data access for ``personal_transfer_senders``: senders whose payments are personal."""
import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.personal_sender_keys import normalize_sender_handle, normalize_sender_name
from app.models.transactions.personal_transfer_sender import PersonalTransferSender
from platform_shared.repositories.audited_writes import delete_rows, upsert_row


async def list_for_organization(
    db: AsyncSession, organization_id: uuid.UUID,
) -> Sequence[PersonalTransferSender]:
    result = await db.execute(
        select(PersonalTransferSender)
        .where(PersonalTransferSender.organization_id == organization_id)
        .order_by(PersonalTransferSender.display_name, PersonalTransferSender.payer_handle),
    )
    return result.scalars().all()


async def list_by_payer_name(
    db: AsyncSession, organization_id: uuid.UUID, payer_name: str | None,
) -> Sequence[PersonalTransferSender]:
    """Every remembered row for this name, any handle. Empty for a nameless payment."""
    name = normalize_sender_name(payer_name)
    if not name:
        return []
    result = await db.execute(
        select(PersonalTransferSender).where(
            PersonalTransferSender.organization_id == organization_id,
            PersonalTransferSender.normalized_payer_name == name,
        ),
    )
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, sender_id: uuid.UUID, organization_id: uuid.UUID,
) -> PersonalTransferSender | None:
    result = await db.execute(
        select(PersonalTransferSender).where(
            PersonalTransferSender.id == sender_id,
            PersonalTransferSender.organization_id == organization_id,
        ),
    )
    return result.scalar_one_or_none()


async def remember(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    created_by_user_id: uuid.UUID | None,
    payer_name: str,
    payer_handle: str | None,
) -> PersonalTransferSender:
    """The remembered row for this name and handle, created if absent. Idempotent.

    Raises ``ValueError`` for a name that is blank once normalized.
    """
    name = normalize_sender_name(payer_name)
    if not name:
        raise ValueError("A personal transfer sender needs a name")
    handle = normalize_sender_handle(payer_handle)
    row, _ = await upsert_row(
        db,
        PersonalTransferSender,
        PersonalTransferSender.organization_id == organization_id,
        PersonalTransferSender.normalized_payer_name == name,
        PersonalTransferSender.payer_handle == handle,
        create={
            "organization_id": organization_id,
            "created_by_user_id": created_by_user_id,
            "display_name": payer_name.strip(),
            "normalized_payer_name": name,
            "payer_handle": handle,
        },
        update={},
    )
    return row


async def delete_by_id(db: AsyncSession, sender_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
    deleted = await delete_rows(
        db,
        PersonalTransferSender,
        PersonalTransferSender.id == sender_id,
        PersonalTransferSender.organization_id == organization_id,
    )
    return bool(deleted)


async def delete_ids(db: AsyncSession, sender_ids: Sequence[uuid.UUID], organization_id: uuid.UUID) -> int:
    if not sender_ids:
        return 0
    deleted = await delete_rows(
        db,
        PersonalTransferSender,
        PersonalTransferSender.id.in_(list(sender_ids)),
        PersonalTransferSender.organization_id == organization_id,
    )
    return len(deleted)
