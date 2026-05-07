"""Repository-level tests for lease templates + tenant isolation.

Exercises the SQLAlchemy queries directly against an in-memory SQLite db
(provided by conftest.py). Service-layer tests are in
``test_lease_template_service.py`` and route-level smoke tests in
``test_lease_templates_api.py``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest

from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)


@pytest.mark.asyncio
async def test_template_create_and_get(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()

    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Default Lease",
    )
    await db.commit()

    fetched = await lease_template_repo.get(
        db, template_id=template.id, user_id=user_id, organization_id=org_id,
    )
    assert fetched is not None
    assert fetched.id == template.id
    assert fetched.version == 1


@pytest.mark.asyncio
async def test_template_cross_tenant_returns_none(db) -> None:
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    org_a, org_b = uuid.uuid4(), uuid.uuid4()

    template = await lease_template_repo.create(
        db, user_id=user_a, organization_id=org_a, name="A's template",
    )
    await db.commit()

    # User B in their own org tries to fetch A's template.
    fetched = await lease_template_repo.get(
        db,
        template_id=template.id,
        user_id=user_b,
        organization_id=org_b,
    )
    assert fetched is None


@pytest.mark.asyncio
async def test_template_soft_delete_skips_deleted_in_list(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()

    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="A",
    )
    await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="B",
    )
    await db.commit()

    deleted = await lease_template_repo.soft_delete(
        db, template_id=t1.id, user_id=user_id, organization_id=org_id,
    )
    await db.commit()
    assert deleted

    rows = await lease_template_repo.list_for_tenant(
        db, user_id=user_id, organization_id=org_id,
    )
    assert {r.name for r in rows} == {"B"}


@pytest.mark.asyncio
async def test_signed_lease_attachment_idor_protection(db) -> None:
    """Cross-tenant DELETE attachment via the composite WHERE must return None."""
    # Tenant A's lease.
    lease_a_id = uuid.uuid4()
    # Tenant B's lease + their attachment.
    lease_b_id = uuid.uuid4()
    user_b = uuid.uuid4()

    now = _dt.datetime.now(_dt.timezone.utc)
    att_b = await signed_lease_attachment_repo.create(
        db,
        lease_id=lease_b_id,
        storage_key=f"signed-leases/{lease_b_id}/{uuid.uuid4()}",
        filename="b.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        kind="signed_lease",
        uploaded_by_user_id=user_b,
        uploaded_at=now,
    )
    await db.commit()

    # Tenant A pairs leaked att_b.id with their own lease_a_id — must return None.
    result = await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
        db, attachment_id=att_b.id, lease_id=lease_a_id,
    )
    await db.commit()
    assert result is None

    # And the row must still exist.
    still = await signed_lease_attachment_repo.get_by_id(db, att_b.id)
    assert still is not None


@pytest.mark.asyncio
async def test_template_in_use_blocks_soft_delete(db) -> None:
    """``has_active_lease_for_template`` reports True when leases link via the join table."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    applicant_id = uuid.uuid4()

    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="In-use",
    )
    await db.commit()

    # No leases yet.
    in_use = await signed_lease_template_repo.has_active_lease_for_template(
        db, template_id=template.id,
    )
    assert in_use is False

    # Create a draft lease and link it to this template via the join row.
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant_id,
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=template.id, display_order=0,
    )
    await db.commit()

    in_use = await signed_lease_template_repo.has_active_lease_for_template(
        db, template_id=template.id,
    )
    assert in_use is True


@pytest.mark.asyncio
async def test_placeholder_unique_constraint(db) -> None:
    """``UNIQUE(template_id, key)`` prevents duplicate keys per template."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="T",
    )
    await db.commit()

    await lease_template_placeholder_repo.create(
        db,
        template_id=template.id,
        key="TENANT FULL NAME",
        display_label="Tenant",
        input_type="text",
        required=True,
        default_source="applicant.legal_name",
        computed_expr=None,
        display_order=0,
    )
    await db.commit()

    with pytest.raises(Exception):  # noqa: BLE001 — sqlite IntegrityError
        await lease_template_placeholder_repo.create(
            db,
            template_id=template.id,
            key="TENANT FULL NAME",
            display_label="Other label",
            input_type="text",
            required=True,
            default_source=None,
            computed_expr=None,
            display_order=1,
        )
        await db.commit()


@pytest.mark.asyncio
async def test_signed_lease_listing_filter(db) -> None:
    """``list_for_tenant`` honours applicant_id, listing_id, and status filters."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="T",
    )
    a1 = uuid.uuid4()
    a2 = uuid.uuid4()
    await db.commit()

    l1 = await signed_lease_repo.create(
        db, user_id=user_id, organization_id=org_id,
        applicant_id=a1, listing_id=None, values={}, starts_on=None, ends_on=None,
        status="draft",
    )
    l2 = await signed_lease_repo.create(
        db, user_id=user_id, organization_id=org_id,
        applicant_id=a2, listing_id=None, values={}, starts_on=None, ends_on=None,
        status="signed",
    )
    await signed_lease_template_repo.create(
        db, lease_id=l1.id, template_id=template.id, display_order=0,
    )
    await signed_lease_template_repo.create(
        db, lease_id=l2.id, template_id=template.id, display_order=0,
    )
    await db.commit()

    only_a1 = await signed_lease_repo.list_for_tenant(
        db, user_id=user_id, organization_id=org_id, applicant_id=a1,
    )
    assert len(only_a1) == 1
    assert only_a1[0].applicant_id == a1

    signed_only = await signed_lease_repo.list_for_tenant(
        db, user_id=user_id, organization_id=org_id, status="signed",
    )
    assert len(signed_only) == 1
    assert signed_only[0].status == "signed"


@pytest.mark.asyncio
async def test_lease_template_files_ordered(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="T",
    )
    await db.commit()

    # Insert in reverse order — listing should sort by display_order.
    for order, name in [(2, "third.md"), (0, "first.md"), (1, "second.md")]:
        await lease_template_file_repo.create(
            db,
            template_id=template.id,
            filename=name,
            storage_key=f"lease-templates/{template.id}/{order}",
            content_type="text/markdown",
            size_bytes=10,
            display_order=order,
        )
    await db.commit()

    files = await lease_template_file_repo.list_for_template(
        db, template_id=template.id,
    )
    assert [f.filename for f in files] == ["first.md", "second.md", "third.md"]
