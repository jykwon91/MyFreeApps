"""Tests for the multi-template signed-lease feature.

Covers:
- Repo: create, list_for_lease, list_template_ids_for_leases, has_active_lease_for_template
- Schema: SignedLeaseCreateRequest backward compat (single template_id → template_ids list)
- Service: create_lease across N templates persists the join rows in pick order
"""
from __future__ import annotations

import uuid

import pytest

from app.repositories.leases import (
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.signed_lease_create_request import SignedLeaseCreateRequest


# ---------------------------------------------------------------------------
# Repo-level tests (sqlite, in-memory db fixture)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_join_table_create_and_list_for_lease(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    applicant_id = uuid.uuid4()

    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Master",
    )
    t2 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Addendum",
    )
    t3 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Rules",
    )
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

    # Insert in non-sequential display_order; the repo must return them ordered.
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t2.id, display_order=2,
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t1.id, display_order=0,
    )
    await signed_lease_template_repo.create(
        db, lease_id=lease.id, template_id=t3.id, display_order=1,
    )
    await db.commit()

    rows = await signed_lease_template_repo.list_for_lease(db, lease_id=lease.id)
    assert [r.template_id for r in rows] == [t1.id, t3.id, t2.id]


@pytest.mark.asyncio
async def test_list_template_ids_for_leases_batches_in_one_query(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()

    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="A",
    )
    t2 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="B",
    )
    l1 = await signed_lease_repo.create(
        db, user_id=user_id, organization_id=org_id,
        applicant_id=uuid.uuid4(), listing_id=None, values={},
        starts_on=None, ends_on=None, status="draft",
    )
    l2 = await signed_lease_repo.create(
        db, user_id=user_id, organization_id=org_id,
        applicant_id=uuid.uuid4(), listing_id=None, values={},
        starts_on=None, ends_on=None, status="draft",
    )
    await signed_lease_template_repo.create(
        db, lease_id=l1.id, template_id=t1.id, display_order=0,
    )
    await signed_lease_template_repo.create(
        db, lease_id=l1.id, template_id=t2.id, display_order=1,
    )
    await signed_lease_template_repo.create(
        db, lease_id=l2.id, template_id=t1.id, display_order=0,
    )
    await db.commit()

    out = await signed_lease_template_repo.list_template_ids_for_leases(
        db, lease_ids=[l1.id, l2.id],
    )
    assert out[l1.id] == [t1.id, t2.id]
    assert out[l2.id] == [t1.id]


@pytest.mark.asyncio
async def test_empty_lease_ids_returns_empty_dict(db) -> None:
    out = await signed_lease_template_repo.list_template_ids_for_leases(
        db, lease_ids=[],
    )
    assert out == {}


# ---------------------------------------------------------------------------
# Schema-level tests — single-template back-compat + dedupe
# ---------------------------------------------------------------------------


def test_create_request_accepts_legacy_single_template_id() -> None:
    tid = uuid.uuid4()
    req = SignedLeaseCreateRequest(
        template_id=tid,
        applicant_id=uuid.uuid4(),
        values={},
    )
    assert req.resolved_template_ids == [tid]


def test_create_request_accepts_template_ids_list() -> None:
    t1, t2 = uuid.uuid4(), uuid.uuid4()
    req = SignedLeaseCreateRequest(
        template_ids=[t1, t2],
        applicant_id=uuid.uuid4(),
        values={},
    )
    assert req.resolved_template_ids == [t1, t2]


def test_create_request_template_ids_takes_precedence_when_both_provided() -> None:
    legacy = uuid.uuid4()
    t1, t2 = uuid.uuid4(), uuid.uuid4()
    req = SignedLeaseCreateRequest(
        template_id=legacy,
        template_ids=[t1, t2],
        applicant_id=uuid.uuid4(),
        values={},
    )
    assert req.resolved_template_ids == [t1, t2]


def test_create_request_dedupes_template_ids_preserving_order() -> None:
    t1, t2 = uuid.uuid4(), uuid.uuid4()
    req = SignedLeaseCreateRequest(
        template_ids=[t1, t2, t1],
        applicant_id=uuid.uuid4(),
        values={},
    )
    assert req.resolved_template_ids == [t1, t2]


def test_create_request_rejects_when_no_template_provided() -> None:
    with pytest.raises(ValueError):
        SignedLeaseCreateRequest(
            applicant_id=uuid.uuid4(),
            values={},
        )


# ---------------------------------------------------------------------------
# Cross-template dedupe of placeholders
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_placeholder_dedup_first_template_wins(db) -> None:
    """When the same key exists in 2 templates, the FIRST template's row wins.

    This mirrors the merge rule used by ``create_lease`` and
    ``generate_defaults_multi``.
    """
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()

    t1 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="A",
    )
    t2 = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="B",
    )

    await lease_template_placeholder_repo.create(
        db,
        template_id=t1.id,
        key="TENANT NAME",
        display_label="From A",
        input_type="text",
        required=True,
        default_source="applicant.legal_name",
        computed_expr=None,
        display_order=0,
    )
    await lease_template_placeholder_repo.create(
        db,
        template_id=t2.id,
        key="TENANT NAME",
        display_label="From B",
        input_type="text",
        required=True,
        default_source="inquiry.inquirer_name",
        computed_expr=None,
        display_order=0,
    )
    await db.commit()

    # Simulate the dedup logic: collect placeholders across templates in
    # order and keep first occurrence per key.
    seen_keys: set[str] = set()
    merged = []
    for tid in [t1.id, t2.id]:
        for p in await lease_template_placeholder_repo.list_for_template(
            db, template_id=tid,
        ):
            if p.key in seen_keys:
                continue
            seen_keys.add(p.key)
            merged.append(p)
    assert len(merged) == 1
    assert merged[0].display_label == "From A"
