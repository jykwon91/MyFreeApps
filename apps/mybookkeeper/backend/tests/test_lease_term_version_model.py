"""Schema tests for the LeaseTermVersion model + signed_leases.parent_lease_id.

Foundation for the lease extension feature (PR 1, see project memory:
``project_lease_extension_feature_design.md``). This test file verifies the
model's basic shape — round-trip persistence, defaults, FK column wiring,
and the table-level index declarations. Behavioural tests for the extension
service land in PR 2.

The in-memory SQLite session in ``conftest.py`` runs with foreign keys OFF,
so FK enforcement is verified at the column-declaration level (presence +
ondelete) rather than via runtime constraint failures.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select

from app.models.leases.lease_term_version import LeaseTermVersion
from app.models.leases.signed_lease import SignedLease


@pytest.mark.asyncio
async def test_lease_term_version_round_trip(db) -> None:
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    applicant_id = uuid.uuid4()

    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant_id,
        kind="generated",
        status="signed",
        starts_on=_dt.date(2026, 1, 1),
        ends_on=_dt.date(2026, 12, 31),
    )
    db.add(lease)
    await db.flush()

    version = LeaseTermVersion(
        lease_id=lease.id,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on,
        source_attachment_id=None,
        created_by_user_id=user_id,
    )
    db.add(version)
    await db.commit()

    fetched = (
        await db.execute(
            select(LeaseTermVersion).where(LeaseTermVersion.lease_id == lease.id)
        )
    ).scalar_one()

    assert fetched.id is not None
    assert fetched.lease_id == lease.id
    assert fetched.starts_on == _dt.date(2026, 1, 1)
    assert fetched.ends_on == _dt.date(2026, 12, 31)
    assert fetched.source_attachment_id is None
    assert fetched.deleted_at is None
    assert fetched.created_at is not None


@pytest.mark.asyncio
async def test_signed_lease_parent_lease_id_round_trip(db) -> None:
    """Successor lease pointer round-trips through the column."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    applicant_id = uuid.uuid4()

    parent = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant_id,
        kind="generated",
        status="ended",
        starts_on=_dt.date(2025, 1, 1),
        ends_on=_dt.date(2025, 12, 31),
    )
    db.add(parent)
    await db.flush()

    successor = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant_id,
        kind="generated",
        status="signed",
        starts_on=_dt.date(2026, 1, 1),
        ends_on=_dt.date(2026, 12, 31),
        parent_lease_id=parent.id,
    )
    db.add(successor)
    await db.commit()

    fetched = (
        await db.execute(
            select(SignedLease).where(SignedLease.id == successor.id)
        )
    ).scalar_one()
    assert fetched.parent_lease_id == parent.id


def test_lease_term_versions_table_has_expected_indexes() -> None:
    """The two partial unique indexes + the lookup index are declared.

    Catches accidental removal of the seed-row uniqueness invariant or the
    addendum-idempotency invariant in a future refactor.
    """
    table = LeaseTermVersion.__table__
    index_names = {ix.name for ix in table.indexes}
    assert "uq_lease_term_versions_lease_attachment" in index_names
    assert "uq_lease_term_versions_seed_per_lease" in index_names
    assert "ix_lease_term_versions_lease_active" in index_names

    # Verify the seed-row index is unique + has the partial predicate.
    seed_ix = next(
        ix for ix in table.indexes
        if ix.name == "uq_lease_term_versions_seed_per_lease"
    )
    assert seed_ix.unique is True
    where = seed_ix.dialect_options["postgresql"].get("where")
    assert where is not None
    assert "source_attachment_id IS NULL" in str(where)
    assert "deleted_at IS NULL" in str(where)

    # Verify the addendum index is unique and excludes the seed row.
    addendum_ix = next(
        ix for ix in table.indexes
        if ix.name == "uq_lease_term_versions_lease_attachment"
    )
    assert addendum_ix.unique is True
    addendum_where = addendum_ix.dialect_options["postgresql"].get("where")
    assert addendum_where is not None
    assert "source_attachment_id IS NOT NULL" in str(addendum_where)


def test_signed_leases_has_ends_on_active_index() -> None:
    """Partial index on ``(organization_id, ends_on)`` for expiring-lease scans."""
    table = SignedLease.__table__
    index_names = {ix.name for ix in table.indexes}
    assert "ix_signed_leases_org_ends_on_active" in index_names

    ends_on_ix = next(
        ix for ix in table.indexes
        if ix.name == "ix_signed_leases_org_ends_on_active"
    )
    where = ends_on_ix.dialect_options["postgresql"].get("where")
    assert where is not None
    assert "deleted_at IS NULL" in str(where)
    assert "ends_on IS NOT NULL" in str(where)


def test_signed_leases_has_parent_lease_id_column() -> None:
    """Successor pointer column is declared with the right FK shape."""
    col = SignedLease.__table__.c.parent_lease_id
    assert col is not None
    assert col.nullable is True
    fk = next(iter(col.foreign_keys), None)
    assert fk is not None
    assert fk.column.table.name == "signed_leases"
    assert fk.ondelete == "SET NULL"


def test_lease_term_version_lease_id_fk_cascades() -> None:
    """Deleting a signed lease must cascade to its term versions."""
    col = LeaseTermVersion.__table__.c.lease_id
    fk = next(iter(col.foreign_keys), None)
    assert fk is not None
    assert fk.column.table.name == "signed_leases"
    assert fk.ondelete == "CASCADE"


def test_lease_term_version_attachment_fk_set_null() -> None:
    """source_attachment_id must NOT cascade — losing the file shouldn't drop the version."""
    col = LeaseTermVersion.__table__.c.source_attachment_id
    fk = next(iter(col.foreign_keys), None)
    assert fk is not None
    assert fk.column.table.name == "signed_lease_attachments"
    assert fk.ondelete == "SET NULL"
