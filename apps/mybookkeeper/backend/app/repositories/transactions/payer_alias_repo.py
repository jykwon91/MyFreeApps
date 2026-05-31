"""Repository for ``payer_alias`` — learned payer → tenant associations.

All queries filter by ``organization_id`` for tenant isolation. Payer names
and handles are normalized (lower-cased + whitespace-stripped) consistently
with the matcher in ``attribution_matcher`` so a lookup, an upsert, and an
auto-match all see the same key.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.payer_alias import PayerAlias


def normalize_payer_name(payer_name: str) -> str:
    """Normalize a payer name to its alias key.

    Mirrors the normalization in ``attribution_matcher.find_best_match``
    (``payer_name.lower().strip()``) so a stored alias matches the same
    incoming payment the auto-matcher would compare.
    """
    return payer_name.lower().strip()


def normalize_handle(payer_handle: str | None) -> str:
    """Normalize a payer handle to its alias-key form.

    Mirrors ``attribution_matcher.normalize_handle``. The empty string is the
    canonical "no handle" value — never NULL — so it participates in the
    ``(org, name, handle, applicant)`` unique key with identical semantics on
    SQLite (tests) and PostgreSQL (prod); NULL uniqueness differs between them.
    """
    return (payer_handle or "").lower().strip()


async def list_by_payer_name(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    payer_name: str,
) -> list[PayerAlias]:
    """Return every learned alias for *payer_name* in this org (0, 1, or many).

    A name may map to more than one tenant — different people who share a name
    (disambiguated by ``payer_handle``), or a name confirmed to two tenants
    with no distinguishing handle (which the matcher treats as ambiguous).
    Returns an empty list for an empty/blank payer name.
    """
    normalized = normalize_payer_name(payer_name)
    if not normalized:
        return []
    result = await db.execute(
        select(PayerAlias).where(
            PayerAlias.organization_id == organization_id,
            PayerAlias.normalized_payer_name == normalized,
        )
    )
    return list(result.scalars().all())


async def get_by_payer_name(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    payer_name: str,
) -> PayerAlias | None:
    """Return the single learned alias for *payer_name*, or None.

    Returns None when the name has zero aliases OR more than one (ambiguous —
    there is no single answer). Callers that need to resolve an incoming
    payment should use :func:`list_by_payer_name` with the matcher; this helper
    is a convenience for the unambiguous case.
    """
    aliases = await list_by_payer_name(
        db, organization_id=organization_id, payer_name=payer_name
    )
    return aliases[0] if len(aliases) == 1 else None


async def upsert(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    payer_name: str,
    applicant_id: uuid.UUID,
    source: str,
    payer_handle: str | None = None,
) -> PayerAlias | None:
    """Remember that *payer_name* (with *payer_handle*) pays for *applicant_id*.

    Keyed on (org, normalized name, normalized handle, applicant): re-confirming
    the SAME payer+handle to the SAME tenant touches the existing row, while
    confirming the same name to a DIFFERENT tenant (or with a different handle)
    adds a new row — letting the matcher disambiguate by handle or flag the name
    ambiguous when it can't. Returns None when *payer_name* is empty/blank
    (nothing to remember) so the caller can skip silently.
    """
    normalized = normalize_payer_name(payer_name)
    if not normalized:
        return None
    handle = normalize_handle(payer_handle)

    result = await db.execute(
        select(PayerAlias).where(
            PayerAlias.organization_id == organization_id,
            PayerAlias.normalized_payer_name == normalized,
            PayerAlias.payer_handle == handle,
            PayerAlias.applicant_id == applicant_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        existing.source = source
        await db.flush()
        return existing

    row = PayerAlias(
        user_id=user_id,
        organization_id=organization_id,
        normalized_payer_name=normalized,
        payer_handle=handle,
        applicant_id=applicant_id,
        source=source,
    )
    db.add(row)
    await db.flush()
    return row
