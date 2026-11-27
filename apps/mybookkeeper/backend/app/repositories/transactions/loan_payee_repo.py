"""Data access for ``loan_payees``: payees whose payments are a mortgage or a loan."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payee_keys import normalized_payee
from app.models.transactions.loan_payee import LoanPayee
from platform_shared.repositories.audited_writes import delete_rows, upsert_row


async def kinds_by_payee(db: AsyncSession, *, organization_id: uuid.UUID) -> dict[str, str]:
    """Normalized payee -> "mortgage" or "loan", for every payee the workspace tagged."""
    result = await db.execute(
        select(LoanPayee.normalized_payee, LoanPayee.kind).where(LoanPayee.organization_id == organization_id),
    )
    return {payee: kind for payee, kind in result.all()}


async def get_kind(db: AsyncSession, *, organization_id: uuid.UUID, payee: str) -> str | None:
    result = await db.execute(
        select(LoanPayee.kind).where(
            LoanPayee.organization_id == organization_id,
            LoanPayee.normalized_payee == normalized_payee(payee),
        ),
    )
    return result.scalar_one_or_none()


async def remember(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    created_by_user_id: uuid.UUID | None,
    payee: str,
    kind: str,
) -> LoanPayee:
    """The payee's row with ``kind``, created if absent. Idempotent; tagging
    again with the other kind changes it. Raises ``ValueError`` for a blank payee."""
    key = normalized_payee(payee)
    if not key:
        raise ValueError("A loan payee needs a name")
    row, _ = await upsert_row(
        db,
        LoanPayee,
        LoanPayee.organization_id == organization_id,
        LoanPayee.normalized_payee == key,
        create={
            "organization_id": organization_id,
            "created_by_user_id": created_by_user_id,
            "display_name": payee.strip(),
            "normalized_payee": key,
            "kind": kind,
        },
        update={"kind": kind},
    )
    return row


async def forget(db: AsyncSession, *, organization_id: uuid.UUID, payee: str) -> bool:
    deleted = await delete_rows(
        db,
        LoanPayee,
        LoanPayee.organization_id == organization_id,
        LoanPayee.normalized_payee == normalized_payee(payee),
    )
    return bool(deleted)
