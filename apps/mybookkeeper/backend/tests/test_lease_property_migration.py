"""The ``signed_leases.property_id`` backfill files each old lease under its house.

From the lease's listing first, else the applicant's inquiry listing; only
rows still NULL, only houses of the lease's own organization, and running it
twice changes nothing. The MBK suite has no Postgres fixture, so the two
backfill statements run on SQLite (the DDL is checked by CI's
``alembic upgrade head`` on Postgres); the same ``UPDATE ... FROM`` is valid
Postgres.
"""
from __future__ import annotations

import datetime as _dt
import importlib.util
import uuid
from decimal import Decimal
from pathlib import Path
from types import ModuleType

import sqlalchemy as sa

from app.db.base import Base

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "leaseprop261125_add_signed_lease_property_id.py"
)
_TABLES = ("organizations", "properties", "listings", "inquiries", "applicants", "signed_leases")


def _module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("leaseprop", _MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _backfill(conn: sa.Connection, module: ModuleType) -> None:
    conn.execute(sa.text(module._BACKFILL_FROM_LEASE_LISTING))
    conn.execute(sa.text(module._BACKFILL_FROM_INQUIRY_LISTING))


def test_backfill_fills_from_the_lease_listing_then_the_inquiry_listing() -> None:
    engine = sa.create_engine("sqlite://")
    meta = Base.metadata.tables
    Base.metadata.create_all(engine, tables=[meta[name] for name in _TABLES])
    org, other_org, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    house_a, house_b, foreign_house, kept_house = (uuid.uuid4() for _ in range(4))
    listing_a, listing_b, foreign_listing = (uuid.uuid4() for _ in range(3))
    leases = {name: uuid.uuid4() for name in ("own_listing", "inquiry", "foreign", "nothing", "already_set")}
    now = _dt.datetime.now(_dt.timezone.utc)

    with engine.begin() as conn:
        for org_id in (org, other_org):
            conn.execute(meta["organizations"].insert().values(id=org_id, name="Org", created_by=user))
        for house_id, org_id in ((house_a, org), (house_b, org), (foreign_house, other_org), (kept_house, org)):
            conn.execute(meta["properties"].insert().values(id=house_id, organization_id=org_id, user_id=user, name="H"))
        for listing_id, house_id, org_id in (
            (listing_a, house_a, org), (listing_b, house_b, org), (foreign_listing, foreign_house, other_org),
        ):
            conn.execute(meta["listings"].insert().values(
                id=listing_id, organization_id=org_id, user_id=user, property_id=house_id, title="Room",
                monthly_rate=Decimal("1000"), room_type="private_room", status="active", amenities=[],
            ))

        def applicant(inquiry_listing: uuid.UUID | None) -> uuid.UUID:
            inquiry_id = None
            if inquiry_listing is not None:
                inquiry_id = uuid.uuid4()
                conn.execute(meta["inquiries"].insert().values(
                    id=inquiry_id, organization_id=org, user_id=user, source="direct", stage="new",
                    listing_id=inquiry_listing, received_at=now,
                ))
            applicant_id = uuid.uuid4()
            conn.execute(meta["applicants"].insert().values(
                id=applicant_id, organization_id=org, user_id=user, stage="lease_signed", inquiry_id=inquiry_id,
            ))
            return applicant_id

        rows = {
            "own_listing": (applicant(listing_b), listing_a, None),
            "inquiry": (applicant(listing_b), None, None),
            "foreign": (applicant(foreign_listing), None, None),
            "nothing": (applicant(None), None, None),
            "already_set": (applicant(listing_b), listing_a, kept_house),
        }
        for name, (applicant_id, listing_id, property_id) in rows.items():
            conn.execute(meta["signed_leases"].insert().values(
                id=leases[name], organization_id=org, user_id=user, applicant_id=applicant_id,
                listing_id=listing_id, property_id=property_id, kind="imported", status="signed", values={},
            ))

    module = _module()
    for _ in range(2):
        with engine.begin() as conn:
            _backfill(conn, module)

    with engine.connect() as conn:
        got = dict(conn.execute(sa.select(meta["signed_leases"].c.id, meta["signed_leases"].c.property_id)).all())
    assert {name: got[lease_id] for name, lease_id in leases.items()} == {
        "own_listing": house_a,
        "inquiry": house_b,
        "foreign": None,
        "nothing": None,
        "already_set": kept_house,
    }
