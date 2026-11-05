"""Service-layer tests for reply_template_service.

Verifies the orchestration contract:
- ``ensure_default_templates_for_user`` is idempotent (re-runnable)
- ``list_templates`` seeds defaults on first call
- ``render_for_inquiry`` resolves template + inquiry + listing + user and
  delegates to the renderer; cross-org access raises LookupError.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.reply_template import ReplyTemplate
from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.schemas.inquiries.reply_template_create_request import (
    ReplyTemplateCreateRequest,
)
from app.schemas.inquiries.reply_template_update_request import (
    ReplyTemplateUpdateRequest,
)
from app.services.inquiries import reply_template_service


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    """Re-route reply_template_service's session factory to the test fixture."""

    @asynccontextmanager
    async def _factory():
        yield db

    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(reply_template_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(reply_template_service, "unit_of_work", _uow)
    return None


@pytest.mark.asyncio
async def test_ensure_default_templates_seeds_three(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await reply_template_service.ensure_default_templates_for_user(
        test_org.id, test_user.id,
    )
    result = await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.user_id == test_user.id)
    )
    templates = result.scalars().all()
    assert len(templates) == 3
    names = {t.name for t in templates}
    assert names == {"Initial inquiry reply", "Polite decline", "Welcome packet"}


@pytest.mark.asyncio
async def test_ensure_default_templates_is_idempotent(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """Running the seed twice produces no duplicates."""
    await reply_template_service.ensure_default_templates_for_user(
        test_org.id, test_user.id,
    )
    await reply_template_service.ensure_default_templates_for_user(
        test_org.id, test_user.id,
    )
    result = await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.user_id == test_user.id)
    )
    templates = result.scalars().all()
    assert len(templates) == 3


@pytest.mark.asyncio
async def test_list_templates_seeds_on_first_call(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    templates = await reply_template_service.list_templates(
        test_org.id, test_user.id,
    )
    assert len(templates) == 3


@pytest.mark.asyncio
async def test_create_template(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    payload = ReplyTemplateCreateRequest(
        name="Custom",
        subject_template="Re: $listing",
        body_template="Hi $name",
        display_order=5,
    )
    created = await reply_template_service.create_template(
        test_org.id, test_user.id, payload,
    )
    assert created.name == "Custom"
    assert created.display_order == 5


@pytest.mark.asyncio
async def test_update_template_changes_fields(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    created = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(
            name="orig", subject_template="s", body_template="b",
        ),
    )
    updated = await reply_template_service.update_template(
        test_user.id, created.id,
        ReplyTemplateUpdateRequest(name="renamed"),
    )
    assert updated.name == "renamed"


@pytest.mark.asyncio
async def test_update_template_cross_user_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    created = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(
            name="orig", subject_template="s", body_template="b",
        ),
    )
    with pytest.raises(LookupError):
        await reply_template_service.update_template(
            uuid.uuid4(), created.id,
            ReplyTemplateUpdateRequest(name="evil"),
        )


@pytest.mark.asyncio
async def test_archive_template(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    created = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(
            name="t", subject_template="s", body_template="b",
        ),
    )
    await reply_template_service.archive_template(test_user.id, created.id)
    # After archive, list should not include it.
    templates = await reply_template_service.list_templates(
        test_org.id, test_user.id,
    )
    names = [t.name for t in templates]
    assert "t" not in names


@pytest.mark.asyncio
async def test_archive_template_missing_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    with pytest.raises(LookupError):
        await reply_template_service.archive_template(
            test_user.id, uuid.uuid4(),
        )


async def _seed_listing(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    title: str = "Cozy Room",
    pets_on_premises: bool = False,
    large_dog_disclosure: str | None = None,
) -> Listing:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Test prop",
        type=PropertyType.LONG_TERM,
    )
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        title=title,
        monthly_rate=Decimal("1500"),
        room_type="private_room",
        status="active",
        pets_on_premises=pets_on_premises,
        large_dog_disclosure=large_dog_disclosure,
    )
    db.add(listing)
    await db.flush()
    return listing


@pytest.mark.asyncio
async def test_render_for_inquiry_includes_dog_disclosure(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    listing = await _seed_listing(
        db, org=test_org, user=test_user,
        pets_on_premises=True,
        large_dog_disclosure="There is a 90lb golden retriever on premises.",
    )
    inquiry = await inquiry_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        listing_id=listing.id,
        inquirer_name="Alice",
        inquirer_email="alice@example.com",
        desired_start_date=_dt.date(2026, 9, 1),
        desired_end_date=_dt.date(2026, 11, 30),
    )
    template = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(
            name="standard",
            subject_template="Re: $listing",
            body_template="Hi $name, want to come stay $dates?",
        ),
    )
    rendered = await reply_template_service.render_for_inquiry(
        test_org.id, test_user.id, inquiry.id, template.id,
    )
    assert rendered.subject == "Re: Cozy Room"
    assert "There is a 90lb golden retriever on premises." in rendered.body
    assert "Alice" in rendered.body
    assert "Sep 1, 2026 to Nov 30, 2026" in rendered.body


@pytest.mark.asyncio
async def test_render_for_inquiry_cross_org_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await inquiry_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        listing_id=listing.id,
        inquirer_email="x@example.com",
    )
    template = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(
            name="t", subject_template="s", body_template="b",
        ),
    )
    other_org_id = uuid.uuid4()
    with pytest.raises(LookupError):
        await reply_template_service.render_for_inquiry(
            other_org_id, test_user.id, inquiry.id, template.id,
        )


@pytest.mark.asyncio
async def test_create_with_a_name_already_used_says_so(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    payload = ReplyTemplateCreateRequest(name="Same", subject_template="s", body_template="b")
    await reply_template_service.create_template(test_org.id, test_user.id, payload)

    with pytest.raises(reply_template_service.ReplyTemplateNameTakenError):
        await reply_template_service.create_template(test_org.id, test_user.id, payload)


@pytest.mark.asyncio
async def test_rename_to_a_name_already_used_says_so_and_changes_nothing(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(name="Taken", subject_template="s", body_template="b"),
    )
    other = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(name="Other", subject_template="s", body_template="b"),
    )

    with pytest.raises(reply_template_service.ReplyTemplateNameTakenError):
        await reply_template_service.update_template(
            test_user.id, other.id, ReplyTemplateUpdateRequest(name="Taken"),
        )

    names = (await db.execute(
        select(ReplyTemplate.name).where(ReplyTemplate.id == other.id),
    )).scalars().all()
    assert names == ["Other"]


@pytest.mark.asyncio
async def test_an_archived_template_still_holds_its_name(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    payload = ReplyTemplateCreateRequest(name="Old", subject_template="s", body_template="b")
    archived = await reply_template_service.create_template(test_org.id, test_user.id, payload)
    await reply_template_service.archive_template(test_user.id, archived.id)

    with pytest.raises(reply_template_service.ReplyTemplateNameTakenError):
        await reply_template_service.create_template(test_org.id, test_user.id, payload)


@pytest.mark.asyncio
async def test_two_people_can_use_the_same_name(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    other_user = User(
        id=uuid.uuid4(), email="other@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(other_user)
    await db.flush()
    payload = ReplyTemplateCreateRequest(name="Same", subject_template="s", body_template="b")
    await reply_template_service.create_template(test_org.id, test_user.id, payload)
    await reply_template_service.create_template(test_org.id, other_user.id, payload)


async def _archived_template(test_org: Organization, test_user: User):  # type: ignore[no-untyped-def]
    created = await reply_template_service.create_template(
        test_org.id, test_user.id,
        ReplyTemplateCreateRequest(name="Old", subject_template="s", body_template="b"),
    )
    await reply_template_service.archive_template(test_user.id, created.id)
    return created


@pytest.mark.asyncio
async def test_archived_templates_are_listed_only_when_asked(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    archived = await _archived_template(test_org, test_user)

    active = await reply_template_service.list_templates(test_org.id, test_user.id)
    everything = await reply_template_service.list_templates(
        test_org.id, test_user.id, include_archived=True,
    )

    assert archived.id not in [t.id for t in active]
    listed = {t.id: t for t in everything}
    assert listed[archived.id].is_archived is True
    assert len(everything) == len(active) + 1


@pytest.mark.asyncio
async def test_an_archived_template_cant_be_changed(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    archived = await _archived_template(test_org, test_user)
    user_id = test_user.id  # each refused change rolls back, which expires test_user

    with pytest.raises(LookupError):
        await reply_template_service.update_template(
            user_id, archived.id, ReplyTemplateUpdateRequest(name="New name"),
        )
    with pytest.raises(LookupError):
        await reply_template_service.update_template(
            user_id, archived.id, ReplyTemplateUpdateRequest(is_archived=True),
        )

    row = (await db.execute(
        select(ReplyTemplate.name, ReplyTemplate.is_archived).where(ReplyTemplate.id == archived.id),
    )).one()
    assert tuple(row) == ("Old", True)


@pytest.mark.asyncio
async def test_an_archived_template_can_be_restored_and_changed_at_once(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    archived = await _archived_template(test_org, test_user)

    restored = await reply_template_service.update_template(
        test_user.id, archived.id,
        ReplyTemplateUpdateRequest(is_archived=False, name="Back again"),
    )

    assert (restored.is_archived, restored.name) == (False, "Back again")
    active = await reply_template_service.list_templates(test_org.id, test_user.id)
    assert archived.id in [t.id for t in active]


@pytest.mark.asyncio
async def test_restoring_someone_else_s_template_raises(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    archived = await _archived_template(test_org, test_user)

    with pytest.raises(LookupError):
        await reply_template_service.update_template(
            uuid.uuid4(), archived.id, ReplyTemplateUpdateRequest(is_archived=False),
        )


@pytest.mark.asyncio
async def test_an_archived_template_cant_be_used_for_a_reply(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    listing = await _seed_listing(db, org=test_org, user=test_user)
    inquiry = await inquiry_repo.create(
        db,
        organization_id=test_org.id,
        user_id=test_user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        listing_id=listing.id,
        inquirer_email="x@example.com",
    )
    archived = await _archived_template(test_org, test_user)

    with pytest.raises(LookupError):
        await reply_template_service.render_for_inquiry(
            test_org.id, test_user.id, inquiry.id, archived.id,
        )
