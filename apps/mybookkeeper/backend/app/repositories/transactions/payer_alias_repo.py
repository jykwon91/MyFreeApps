"""Repository for ``payer_alias`` — learned payer → tenant associations.

All queries filter by ``organization_id`` for tenant isolation. Payer names
are normalized (lower-cased + whitespace-stripped) consistently with the
matcher in ``attribution_service.find_best_match`` so a lookup and an
auto-match see the same key.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.payer_alias import PayerAlias


def normalize_payer_name(payer_name: str) -> str:
    """Normalize a payer name to its alias key.

    Mirrors the normalization in ``attribution_service.find_best_match``
    (``payer_name.lower().strip()``) so a stored alias matches the same
    incoming payment the auto-matcher would compare.
    """
    return payer_name.lower().strip()


async def get_by_payer_name(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    payer_name: str,
) -> PayerAlias | None:
    """Return the learned alias for *payer_name* in this org, or None.

    Returns None for an empty/blank payer name (nothing to key on).
    """
    normalized = normalize_payer_name(payer_name)
    if not normalized:
        return None
    result = await db.execute(
        select(PayerAlias).where(
            PayerAlias.organization_id == organization_id,
            PayerAlias.normalized_payer_name == normalized,
        )
    )
    return result.scalar_one_or_none()


async def upsert(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    payer_name: str,
    applicant_id: uuid.UUID,
    source: str,
) -> PayerAlias | None:
    """Remember that *payer_name* pays for *applicant_id* in this org.

    Idempotent per (org, normalized name): re-confirming an existing payer to
    a different tenant updates the target (latest confirmation wins). Returns
    None when *payer_name* is empty/blank (nothing to remember) so the caller
    can skip silently.
    """
    normalized = normalize_payer_name(payer_name)
    if not normalized:
        return None

    existing = await get_by_payer_name(
        db, organization_id=organization_id, payer_name=payer_name
    )
    if existing is not None:
        existing.applicant_id = applicant_id
        existing.source = source
        await db.flush()
        return existing

    row = PayerAlias(
        user_id=user_id,
        organization_id=organization_id,
        normalized_payer_name=normalized,
        applicant_id=applicant_id,
        source=source,
    )
    db.add(row)
    await db.flush()
    return row
