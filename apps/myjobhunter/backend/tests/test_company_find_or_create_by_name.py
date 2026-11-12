"""Tests for ``company_service.find_or_create_by_name`` — the single name matcher.

Used by both promote paths (job-analysis and discovery). Match key is the
user's company name, case-insensitive and whitespace-trimmed; the legal
suffix is NOT normalised ("Acme Inc." and "Acme" stay distinct), and two
companies with different names but the same domain are rejected by the
``(user_id, lower(primary_domain))`` unique constraint rather than merged.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.services.company import company_service


async def _count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await db.execute(select(func.count()).select_from(Company).where(Company.user_id == user_id))
    ).scalar_one()


async def _seed(db: AsyncSession, user_id: uuid.UUID, name: str, domain: str | None = None) -> Company:
    company = Company(user_id=user_id, name=name, primary_domain=domain)
    db.add(company)
    await db.flush()
    return company


@pytest.mark.asyncio
async def test_creates_when_missing(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    company = await company_service.find_or_create_by_name(db, user_id, "Acme")
    assert company.name == "Acme"
    assert await _count(db, user_id) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("lookup", ["acme", "ACME", "  Acme  ", "aCmE\t"])
async def test_matches_case_and_surrounding_whitespace(
    db: AsyncSession, user_factory, lookup: str,
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    seeded = await _seed(db, user_id, "Acme")
    found = await company_service.find_or_create_by_name(db, user_id, lookup)
    assert found.id == seeded.id
    assert await _count(db, user_id) == 1


@pytest.mark.asyncio
async def test_matches_stored_name_with_padding(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    seeded = await _seed(db, user_id, "  Acme ")
    found = await company_service.find_or_create_by_name(db, user_id, "acme")
    assert found.id == seeded.id


@pytest.mark.asyncio
async def test_legal_suffix_is_not_normalised(db: AsyncSession, user_factory) -> None:
    """No name normaliser exists in the codebase; suffix variants stay distinct."""
    user_id = uuid.UUID((await user_factory())["id"])
    seeded = await _seed(db, user_id, "Acme")
    other = await company_service.find_or_create_by_name(db, user_id, "Acme Inc.")
    assert other.id != seeded.id
    assert await _count(db, user_id) == 2


@pytest.mark.asyncio
async def test_substring_name_does_not_match(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    await _seed(db, user_id, "Acme Corp")
    other = await company_service.find_or_create_by_name(db, user_id, "Acme")
    assert other.name == "Acme"
    assert await _count(db, user_id) == 2


@pytest.mark.asyncio
async def test_same_name_different_domains_matches_by_name(db: AsyncSession, user_factory) -> None:
    """Name is the match key here; a stored domain does not split the match."""
    user_id = uuid.UUID((await user_factory())["id"])
    seeded = await _seed(db, user_id, "Acme", "acme.com")
    found = await company_service.find_or_create_by_name(db, user_id, "Acme")
    assert found.id == seeded.id
    assert found.primary_domain == "acme.com"


@pytest.mark.asyncio
async def test_same_domain_different_name_stays_distinct_by_constraint(
    db: AsyncSession, user_factory,
) -> None:
    """Two names sharing a domain can't both exist; the DB constraint guards it."""
    user_id = uuid.UUID((await user_factory())["id"])
    await _seed(db, user_id, "Acme", "acme.com")
    with pytest.raises(IntegrityError):
        await _seed(db, user_id, "Acme Holdings", "https://www.ACME.com")
    await db.rollback()


@pytest.mark.asyncio
async def test_other_users_company_never_matches(db: AsyncSession, user_factory) -> None:
    user_a = uuid.UUID((await user_factory())["id"])
    user_b = uuid.UUID((await user_factory())["id"])
    theirs = await _seed(db, user_a, "Acme")
    mine = await company_service.find_or_create_by_name(db, user_b, "acme")
    assert mine.id != theirs.id
    assert mine.user_id == user_b
    assert await _count(db, user_a) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("blank", [None, "", "   "])
async def test_blank_name_falls_back_to_unknown(db: AsyncSession, user_factory, blank) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    first = await company_service.find_or_create_by_name(db, user_id, blank)
    second = await company_service.find_or_create_by_name(db, user_id, None)
    assert first.name == "Unknown company"
    assert second.id == first.id


@pytest.mark.asyncio
async def test_duplicate_names_resolve_to_oldest(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    first = await _seed(db, user_id, "Acme")
    await _seed(db, user_id, "ACME")
    found = await company_service.find_or_create_by_name(db, user_id, "acme")
    assert found.id == first.id


@pytest.mark.asyncio
async def test_long_name_truncated_then_matched(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    long_name = "X" * 250
    first = await company_service.find_or_create_by_name(db, user_id, long_name)
    second = await company_service.find_or_create_by_name(db, user_id, long_name)
    assert len(first.name) == 200
    assert second.id == first.id
