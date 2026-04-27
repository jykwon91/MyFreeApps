"""Repository-layer tests for ``reply_template_repo``."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import reply_template_repo


@pytest.mark.asyncio
async def test_create_inserts_row(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    template = await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="Initial reply",
        subject_template="Re: $listing",
        body_template="Hi $name",
    )
    await db.commit()
    assert template.id is not None
    assert template.is_archived is False
    assert template.display_order == 0


@pytest.mark.asyncio
async def test_unique_name_per_user(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="dup-name",
        subject_template="s",
        body_template="b",
    )
    await db.commit()
    with pytest.raises(Exception):  # IntegrityError on UNIQUE
        await reply_template_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            name="dup-name",
            subject_template="s2",
            body_template="b2",
        )
        await db.commit()


@pytest.mark.asyncio
async def test_find_by_user_and_name(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="Welcome",
        subject_template="s",
        body_template="b",
    )
    await db.commit()
    found = await reply_template_repo.find_by_user_and_name(
        db, test_user.id, "Welcome",
    )
    assert found is not None
    miss = await reply_template_repo.find_by_user_and_name(
        db, test_user.id, "nope",
    )
    assert miss is None


@pytest.mark.asyncio
async def test_list_by_user_excludes_archived_by_default(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    t1 = await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="t1", subject_template="s1", body_template="b1",
    )
    await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="t2", subject_template="s2", body_template="b2",
    )
    await db.commit()
    await reply_template_repo.archive(db, t1.id, test_user.id)
    await db.commit()

    active = await reply_template_repo.list_by_user(
        db, test_org.id, test_user.id,
    )
    assert [t.name for t in active] == ["t2"]

    everything = await reply_template_repo.list_by_user(
        db, test_org.id, test_user.id, include_archived=True,
    )
    assert {t.name for t in everything} == {"t1", "t2"}


@pytest.mark.asyncio
async def test_update_template_only_allowlisted_fields(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    template = await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="orig", subject_template="s", body_template="b",
    )
    await db.commit()
    bogus_user_id = uuid.uuid4()
    updated = await reply_template_repo.update_template(
        db, template.id, test_user.id,
        # ``user_id`` is NOT in the allowlist — must be silently dropped.
        {"name": "updated", "user_id": bogus_user_id, "subject_template": "new"},
    )
    await db.commit()
    assert updated is not None
    assert updated.name == "updated"
    assert updated.subject_template == "new"
    # Tenant column did NOT change.
    assert updated.user_id == test_user.id


@pytest.mark.asyncio
async def test_archive_returns_true_then_false(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    template = await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="t", subject_template="s", body_template="b",
    )
    await db.commit()
    assert await reply_template_repo.archive(db, template.id, test_user.id) is True
    await db.commit()
    # Idempotent — archiving again is a no-op (returns False, doesn't error).
    assert await reply_template_repo.archive(db, template.id, test_user.id) is False


@pytest.mark.asyncio
async def test_get_by_id_and_user_scopes_to_user(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    template = await reply_template_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        name="t", subject_template="s", body_template="b",
    )
    await db.commit()

    found = await reply_template_repo.get_by_id_and_user(
        db, template.id, test_user.id,
    )
    assert found is not None

    other_user_id = uuid.uuid4()
    miss = await reply_template_repo.get_by_id_and_user(
        db, template.id, other_user_id,
    )
    assert miss is None
