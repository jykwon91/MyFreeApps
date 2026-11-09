"""The CSV and PDF exports hold exactly the rows the transaction list returns for the same filters."""
import csv
import io
import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from tests.test_transaction_routes import (  # noqa: F401  (fixtures)
    _patch_service_session,
    _seed_transaction,
    client,
    org,
    owner,
    prop,
)


@pytest.fixture(autouse=True)
def _patch_export_session(db: AsyncSession):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch("app.services.transactions.export_service.AsyncSessionLocal", _fake_session):
        yield


async def _seed_mix(
    db: AsyncSession, org: Organization, owner: User, prop: Property,
) -> uuid.UUID:
    """Four transactions that differ on vendor, property, status and applicant. Returns the applicant's id."""
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org.id, user_id=owner.id,
        stage="lease_signed", legal_name="Tenant One",
    )
    db.add(applicant)
    await db.commit()
    a = await _seed_transaction(db, org, owner, property_id=prop.id, status="approved", vendor="Alpha Plumbing")
    a.applicant_id = applicant.id
    await _seed_transaction(db, org, owner, status="pending", vendor="Beta Roofing")
    await _seed_transaction(db, org, owner, status="approved", vendor="Gamma Lawn")
    await _seed_transaction(db, org, owner, property_id=prop.id, status="approved", vendor="alpha electric")
    await db.commit()
    return applicant.id


def _csv_vendors(body: bytes) -> list[str]:
    rows = list(csv.reader(io.StringIO(body.decode("utf-8"))))
    return sorted(row[1] for row in rows[1:])


async def _filter_cases(db: AsyncSession, org: Organization, owner: User, prop: Property) -> list[dict[str, str]]:
    applicant_id = await _seed_mix(db, org, owner, prop)
    return [
        {"vendor": "alpha"},
        {"unassigned": "true"},
        {"to_review": "true"},
        {"applicant_id": str(applicant_id)},
    ]


class TestExportMatchesList:
    @pytest.mark.asyncio
    async def test_csv_holds_exactly_what_the_list_returns_for_every_filter(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        cases = await _filter_cases(db, org, owner, prop)
        everything = (await client.get("/exports/transactions/csv")).content
        assert len(_csv_vendors(everything)) == 4

        for params in cases:
            listed = sorted(t["vendor"] for t in (await client.get("/transactions", params=params)).json())
            exported = await client.get("/exports/transactions/csv", params=params)
            assert exported.status_code == 200
            assert 0 < len(listed) < 4, params
            assert _csv_vendors(exported.content) == listed, params

    @pytest.mark.asyncio
    async def test_each_ignored_filter_picks_the_expected_rows(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        cases = await _filter_cases(db, org, owner, prop)
        expected = [
            ["Alpha Plumbing", "alpha electric"],
            ["Beta Roofing", "Gamma Lawn"],
            ["Beta Roofing"],
            ["Alpha Plumbing"],
        ]
        for params, vendors in zip(cases, expected):
            body = (await client.get("/exports/transactions/csv", params=params)).content
            assert _csv_vendors(body) == sorted(vendors), params

    @pytest.mark.asyncio
    async def test_pdf_holds_exactly_what_the_list_returns(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        await _seed_mix(db, org, owner, prop)
        params = {"vendor": "alpha"}
        exported = await client.get("/exports/transactions/pdf", params=params)
        assert exported.status_code == 200
        text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(exported.content)).pages)
        assert "Alpha Plumbing" in text and "alpha electric" in text
        assert "Beta Roofing" not in text and "Gamma Lawn" not in text

    @pytest.mark.asyncio
    async def test_export_stays_inside_the_organization(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        from app.repositories import organization_repo

        other = await organization_repo.create(db, "Other Org", owner.id)
        await db.commit()
        await _seed_transaction(db, other, owner, vendor="Alpha Elsewhere")
        await _seed_mix(db, org, owner, prop)

        body = (await client.get("/exports/transactions/csv", params={"vendor": "alpha"})).content
        assert "Alpha Elsewhere" not in _csv_vendors(body)
