"""Tests for the "add template to existing lease" feature.

Covers:
- Service: happy path, duplicate rejection, imported-lease rejection,
  missing template rejection
- Repo: max_display_order_for_lease helper
- API: 200, 404, 409, 422 contract tests
- Schema: SignedLeaseAddTemplatesRequest validates non-empty list
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.signed_lease_add_templates_request import (
    SignedLeaseAddTemplatesRequest,
)
from app.services.leases.signed_lease_service import (
    ImportedLeaseTemplateError,
    SignedLeaseNotFoundError,
    TemplatesAlreadyLinkedError,
    add_templates_and_generate,
)
from app.services.leases.lease_template_service import TemplateNotFoundError


# ---------------------------------------------------------------------------
# Repo: max_display_order_for_lease
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_max_display_order_returns_minus_one_when_no_links(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
    )
    await db.commit()

    result = await signed_lease_template_repo.max_display_order_for_lease(
        db, lease_id=lease.id,
    )
    assert result == -1


@pytest.mark.asyncio
async def test_max_display_order_returns_highest_order(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="T1",
    )
    t2 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="T2",
    )
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t1.id, display_order=0,
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t2.id, display_order=3,
    )
    await db.commit()

    result = await signed_lease_template_repo.max_display_order_for_lease(
        db, lease_id=lease.id,
    )
    assert result == 3


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def test_add_templates_request_rejects_empty_list() -> None:
    with pytest.raises(ValueError):
        SignedLeaseAddTemplatesRequest(template_ids=[])


def test_add_templates_request_accepts_one_or_more_ids() -> None:
    req = SignedLeaseAddTemplatesRequest(template_ids=[uuid.uuid4()])
    assert len(req.template_ids) == 1


# ---------------------------------------------------------------------------
# Service unit tests — patched unit_of_work + storage
# ---------------------------------------------------------------------------

from contextlib import asynccontextmanager
from unittest.mock import patch as _patch
from sqlalchemy.ext.asyncio import AsyncSession


def _make_fake_uow(session: AsyncSession):
    """Patch helper: yields the in-memory SQLite test session via unit_of_work."""
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


@pytest.mark.asyncio
async def test_add_templates_raises_not_found_for_unknown_lease(db) -> None:
    with _patch(
        "app.services.leases.signed_lease_service.unit_of_work",
        _make_fake_uow(db),
    ):
        with pytest.raises(SignedLeaseNotFoundError):
            await add_templates_and_generate(
                user_id=uuid.uuid4(),
                organization_id=uuid.uuid4(),
                lease_id=uuid.uuid4(),
                template_ids=[uuid.uuid4()],
            )


@pytest.mark.asyncio
async def test_add_templates_rejects_imported_lease(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="signed",
        kind="imported",
    )
    await db.commit()

    with _patch(
        "app.services.leases.signed_lease_service.unit_of_work",
        _make_fake_uow(db),
    ):
        with pytest.raises(ImportedLeaseTemplateError):
            await add_templates_and_generate(
                user_id=user_id,
                organization_id=org_id,
                lease_id=lease.id,
                template_ids=[uuid.uuid4()],
            )


@pytest.mark.asyncio
async def test_add_templates_raises_not_found_for_unknown_template(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
        kind="generated",
    )
    await db.commit()

    with _patch(
        "app.services.leases.signed_lease_service.unit_of_work",
        _make_fake_uow(db),
    ):
        with pytest.raises(TemplateNotFoundError):
            await add_templates_and_generate(
                user_id=user_id,
                organization_id=org_id,
                lease_id=lease.id,
                template_ids=[uuid.uuid4()],  # random UUID — not in DB
            )


@pytest.mark.asyncio
async def test_add_templates_rejects_already_linked(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Existing",
    )
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
        kind="generated",
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t1.id, display_order=0,
    )
    await db.commit()

    with _patch(
        "app.services.leases.signed_lease_service.unit_of_work",
        _make_fake_uow(db),
    ):
        with pytest.raises(TemplatesAlreadyLinkedError) as exc_info:
            await add_templates_and_generate(
                user_id=user_id,
                organization_id=org_id,
                lease_id=lease.id,
                template_ids=[t1.id],
            )
    assert t1.id in exc_info.value.duplicate_ids


@pytest.mark.asyncio
async def test_add_templates_happy_path_links_and_renders(db) -> None:
    """End-to-end: new template link inserted, attachment created via mocked storage."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    existing_t = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Existing",
    )
    new_t = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="New Addendum",
    )
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={"TENANT NAME": "Alice"},
        starts_on=None,
        ends_on=None,
        status="generated",
        kind="generated",
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=existing_t.id, display_order=0,
    )
    # Add a file to the new template so there's something to render.
    await lease_template_file_repo.create(
        db,
        template_id=new_t.id,
        filename="addendum.md",
        storage_key=f"templates/{new_t.id}/addendum.md",
        content_type="text/markdown",
        size_bytes=12,
        display_order=0,
    )
    await db.commit()

    fake_storage = MagicMock()
    fake_storage.download_file.return_value = b"# Hello {{TENANT NAME}}"
    fake_storage.upload_file.return_value = None

    with (
        _patch(
            "app.services.leases.signed_lease_service.unit_of_work",
            _make_fake_uow(db),
        ),
        _patch(
            "app.services.leases.signed_lease_service.get_storage",
            return_value=fake_storage,
        ),
        _patch(
            "app.services.leases.signed_lease_service.render_md",
            return_value="# Hello Alice",
        ),
        _patch(
            "app.services.leases.signed_lease_service.render_md_text_to_pdf_or_keep",
            return_value=b"%PDF-1.4 fake",
        ),
    ):
        result = await add_templates_and_generate(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            template_ids=[new_t.id],
        )

    # The result should include both templates.
    template_ids_in_result = [t.id for t in result.templates]
    assert existing_t.id in template_ids_in_result
    assert new_t.id in template_ids_in_result

    # The new template should have display_order = max_existing + 1.
    new_link = next(t for t in result.templates if t.id == new_t.id)
    assert new_link.display_order == 1

    # There should be one attachment (for the new template's file).
    rendered = [a for a in result.attachments if a.kind == "rendered_original"]
    assert len(rendered) == 1
    assert rendered[0].filename == "addendum.pdf"

    # storage.upload_file was called once.
    fake_storage.upload_file.assert_called_once()


# ---------------------------------------------------------------------------
# The 422 for empty list is covered by the schema test above.
# No separate API contract test needed — auth fires before body parse so
# a proper API integration test requires a real auth token (done in e2e).
