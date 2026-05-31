"""Tests for payer_alias_repo — learned payer -> tenant associations.

Covers normalization parity with the matcher, upsert idempotence (latest
confirmation wins), blank-name no-ops, and tenant isolation.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.transactions.payer_alias import PayerAlias
from app.repositories.transactions import payer_alias_repo


async def _make_applicant(db: AsyncSession, org_id, user_id, name="Prince Kapoor"):
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name=name,
    )
    db.add(applicant)
    await db.flush()
    return applicant


def test_normalize_matches_matcher():
    """normalize_payer_name mirrors find_best_match's lower().strip()."""
    assert payer_alias_repo.normalize_payer_name("  Tushar KAPOOR ") == "tushar kapoor"
    assert payer_alias_repo.normalize_payer_name("") == ""


def test_normalize_handle():
    """normalize_handle lower/strips and maps blank/None to the '' sentinel."""
    assert payer_alias_repo.normalize_handle("  Jdoe@Gmail.com ") == "jdoe@gmail.com"
    assert payer_alias_repo.normalize_handle("@John-Doe") == "@john-doe"
    assert payer_alias_repo.normalize_handle(None) == ""
    assert payer_alias_repo.normalize_handle("   ") == ""


@pytest.mark.asyncio
async def test_upsert_creates_then_get_normalizes(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    applicant = await _make_applicant(db, org_id, user_id)

    created = await payer_alias_repo.upsert(
        db,
        user_id=user_id,
        organization_id=org_id,
        payer_name="Tushar Kapoor",
        applicant_id=applicant.id,
        source="manual_link",
    )
    assert created is not None
    assert created.normalized_payer_name == "tushar kapoor"
    assert created.applicant_id == applicant.id
    assert created.source == "manual_link"

    # Lookup is case/whitespace-insensitive.
    found = await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="  TUSHAR KAPOOR  "
    )
    assert found is not None
    assert found.id == created.id


@pytest.mark.asyncio
async def test_upsert_same_key_touches_single_row(db: AsyncSession):
    """Re-confirming the SAME (name, handle, tenant) touches one row, not adds."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")

    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="Tushar Kapoor", applicant_id=prince.id, source="confirm",
    )
    # Same name (case/space-insensitive), same (absent) handle, same tenant.
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="  tushar kapoor ", applicant_id=prince.id, source="manual_link",
    )

    rows = (
        await db.execute(
            select(PayerAlias).where(PayerAlias.organization_id == org_id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].applicant_id == prince.id
    assert rows[0].source == "manual_link"  # latest source wins on touch
    assert rows[0].payer_handle == ""  # '' sentinel, never NULL


@pytest.mark.asyncio
async def test_upsert_same_name_different_tenant_creates_two_rows(db: AsyncSession):
    """A name confirmed to two tenants (no handle) keeps BOTH rows → ambiguous.

    Inverts the old latest-wins behavior: silently overwriting one tenant with
    another is the wrong-attribution hazard PR3 closes. Two rows let the matcher
    flag the name ambiguous and route to review.
    """
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    first = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    second = await _make_applicant(db, org_id, user_id, "Rahul Kapoor")

    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="Tushar Kapoor", applicant_id=first.id, source="confirm",
    )
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="tushar kapoor", applicant_id=second.id, source="manual_link",
    )

    rows = (
        await db.execute(
            select(PayerAlias).where(PayerAlias.organization_id == org_id)
        )
    ).scalars().all()
    assert {r.applicant_id for r in rows} == {first.id, second.id}
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_upsert_same_name_different_handle_creates_two_rows(db: AsyncSession):
    """Two different people sharing a name, distinct handles → two rows."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    a = await _make_applicant(db, org_id, user_id, "Tenant A")
    b = await _make_applicant(db, org_id, user_id, "Tenant B")

    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="John Smith", applicant_id=a.id, source="manual_link",
        payer_handle="john.a@gmail.com",
    )
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="John Smith", applicant_id=b.id, source="manual_link",
        payer_handle="john.b@gmail.com",
    )

    rows = await payer_alias_repo.list_by_payer_name(
        db, organization_id=org_id, payer_name="John Smith"
    )
    assert len(rows) == 2
    by_handle = {r.payer_handle: r.applicant_id for r in rows}
    assert by_handle == {"john.a@gmail.com": a.id, "john.b@gmail.com": b.id}


@pytest.mark.asyncio
async def test_get_by_payer_name_none_when_ambiguous(db: AsyncSession):
    """get_by_payer_name returns None (not the first) when a name has 2+ rows."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    first = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    second = await _make_applicant(db, org_id, user_id, "Rahul Kapoor")
    for app_ in (first, second):
        await payer_alias_repo.upsert(
            db, user_id=user_id, organization_id=org_id,
            payer_name="Tushar Kapoor", applicant_id=app_.id, source="confirm",
        )
    assert await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="Tushar Kapoor"
    ) is None
    assert len(await payer_alias_repo.list_by_payer_name(
        db, organization_id=org_id, payer_name="Tushar Kapoor"
    )) == 2


@pytest.mark.asyncio
async def test_upsert_blank_name_is_noop(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    applicant = await _make_applicant(db, org_id, user_id)
    result = await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="   ", applicant_id=applicant.id, source="confirm",
    )
    assert result is None
    rows = (
        await db.execute(select(PayerAlias).where(PayerAlias.organization_id == org_id))
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_get_returns_none_for_unknown_and_blank(db: AsyncSession):
    org_id = uuid.uuid4()
    assert await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="Nobody"
    ) is None
    assert await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="  "
    ) is None


@pytest.mark.asyncio
async def test_tenant_isolation(db: AsyncSession):
    """An alias in org A is invisible to org B."""
    org_a, org_b, user_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    applicant = await _make_applicant(db, org_a, user_id)
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_a,
        payer_name="Tushar Kapoor", applicant_id=applicant.id, source="confirm",
    )
    assert await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_b, payer_name="Tushar Kapoor"
    ) is None
