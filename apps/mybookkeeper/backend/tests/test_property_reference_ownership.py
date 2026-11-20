"""Client-supplied property and activity ids must name rows of the caller's org.

The foreign keys only prove a property or activity exists — the tables are
global, so nothing at the database layer stops one organization from hanging
an import, an upload, a classification rule, an activity, a utility plan or a
rent schedule off another organization's building. A rule is the worst case:
every transaction it later matches inherits its property and activity.

Every entry point answers 422, the same as the transaction routes. The lookups
that turn property ids into Schedule E labels and classifications, and the
reclassify cascade, are scoped to the organization too, so a stray id can never
pull another tenant's address or activity into this one's figures.

Services open their own session via ``unit_of_work()``; each test patches it to
yield the in-memory SQLite test session instead.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext, worker_context
from app.core.permissions import current_org_member, require_write_access
from app.core.upload_errors import upload_error_status
from app.core.utility_plan_constants import RATE_TYPE_FIXED, SERVICE_TYPE_ELECTRICITY
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.classification.classification_rule import ClassificationRule
from app.models.documents.document import Document
from app.models.organization.activity import Activity
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.models.rent.rent_schedule import RentSchedule
from app.models.transactions.transaction import Transaction
from app.repositories import activity_repo
from app.repositories.properties import property_repo, utility_plan_repo
from app.services.classification import rule_service
from app.services.documents.document_upload_service import accept_upload
from app.services.organization import activity_service
from app.services.properties import property_service, utility_plan_service
from app.services.rent import rent_schedule_service
from app.services.transactions.foreign_reference_error import ForeignReferenceError
from app.services.transactions.import_service import import_bank_csv_file

pytestmark = pytest.mark.asyncio

_TODAY = _dt.date(2026, 8, 15)
_CHASE_CSV = (
    b"Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n"
    b"DEBIT,08/01/2026,CENTERPOINT ENERGY,-120.50,ACH_DEBIT,1000.00,\n"
)


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


def _uow_patched(session: AsyncSession, *modules: str) -> ExitStack:
    stack = ExitStack()
    for module in modules:
        stack.enter_context(patch(f"{module}.unit_of_work", _fake_uow(session)))
    return stack


async def _property(
    db: AsyncSession, org_id: uuid.UUID, name: str = "6734 Peerless St",
    classification: PropertyClassification = PropertyClassification.INVESTMENT,
) -> Property:
    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=uuid.uuid4(),
        name=name, address=name, classification=classification,
        type=PropertyType.SHORT_TERM,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _activity(
    db: AsyncSession, org_id: uuid.UUID, property_id: uuid.UUID | None = None,
) -> Activity:
    return await activity_repo.create(
        db, organization_id=org_id, label="Peerless rental",
        activity_type="rental_property", tax_form="schedule_e",
        property_id=property_id,
    )


async def _count(db: AsyncSession, model: type) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


def _ctx() -> RequestContext:
    return worker_context(uuid.uuid4(), uuid.uuid4())


class TestBankCsvImport:
    async def test_importing_against_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(db, "app.services.transactions.import_service"):
            with pytest.raises(ForeignReferenceError):
                await import_bank_csv_file(_ctx(), _CHASE_CSV, "chase.csv", theirs.id)

        assert await _count(db, Transaction) == 0

    async def test_importing_against_our_own_property_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        ctx = _ctx()
        ours = await _property(db, ctx.organization_id)

        with _uow_patched(db, "app.services.transactions.import_service"):
            result = await import_bank_csv_file(ctx, _CHASE_CSV, "chase.csv", ours.id)

        assert result.imported == 1
        txn = (await db.execute(select(Transaction))).scalar_one()
        assert txn.property_id == ours.id


class TestDocumentUpload:
    async def test_uploading_against_another_orgs_property_is_rejected_as_422(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(db, "app.services.documents.document_upload_service"):
            with pytest.raises(ForeignReferenceError) as exc:
                await accept_upload(
                    _ctx(), b"%PDF-1.4 water bill", "bill.pdf", "application/pdf",
                    theirs.id,
                )

        assert upload_error_status(str(exc.value)) == 422
        assert await _count(db, Document) == 0

    async def test_uploading_against_our_own_property_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        ctx = _ctx()
        ours = await _property(db, ctx.organization_id)

        with _uow_patched(db, "app.services.documents.document_upload_service"):
            result = await accept_upload(
                ctx, b"%PDF-1.4 water bill", "bill.pdf", "application/pdf", ours.id,
            )

        doc = await db.get(Document, uuid.UUID(str(result["document_id"])))
        assert doc is not None and doc.property_id == ours.id


class TestActivityCreate:
    async def test_an_activity_on_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(db, "app.services.organization.activity_service"):
            with pytest.raises(ForeignReferenceError):
                await activity_service.create_activity(
                    _ctx(), label="Theirs", activity_type="rental_property",
                    tax_form="schedule_e", property_id=theirs.id,
                )

        assert await _count(db, Activity) == 0

    async def test_an_activity_on_our_own_property_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        ctx = _ctx()
        ours = await _property(db, ctx.organization_id)

        with _uow_patched(db, "app.services.organization.activity_service"):
            activity = await activity_service.create_activity(
                ctx, label="Ours", activity_type="rental_property",
                tax_form="schedule_e", property_id=ours.id,
            )

        assert activity.property_id == ours.id


class TestClassificationRuleCreate:
    def _data(self, **refs: uuid.UUID) -> dict:
        return {
            "match_type": "vendor", "match_pattern": "CenterPoint",
            "match_context": None, "category": "utilities", **refs,
        }

    async def test_a_rule_naming_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(db, "app.services.classification.rule_service"):
            with pytest.raises(ForeignReferenceError, match="property_id"):
                await rule_service.create_rule(
                    uuid.uuid4(), uuid.uuid4(), self._data(property_id=theirs.id),
                )

        assert await _count(db, ClassificationRule) == 0

    async def test_a_rule_naming_another_orgs_activity_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _activity(db, uuid.uuid4())

        with _uow_patched(db, "app.services.classification.rule_service"):
            with pytest.raises(ForeignReferenceError, match="activity_id"):
                await rule_service.create_rule(
                    uuid.uuid4(), uuid.uuid4(), self._data(activity_id=theirs.id),
                )

        assert await _count(db, ClassificationRule) == 0

    async def test_a_rule_naming_our_own_property_and_activity_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        prop = await _property(db, org_id)
        activity = await _activity(db, org_id, prop.id)

        with _uow_patched(db, "app.services.classification.rule_service"):
            rule = await rule_service.create_rule(
                org_id, uuid.uuid4(),
                self._data(property_id=prop.id, activity_id=activity.id),
            )

        assert (rule.property_id, rule.activity_id) == (prop.id, activity.id)


class TestUtilityPlanCreate:
    async def test_a_plan_on_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(db, "app.services.properties.utility_plan_service"):
            with pytest.raises(
                utility_plan_service.InvalidUtilityPlanError, match="property_id",
            ):
                await utility_plan_service.create_plan(
                    user_id=uuid.uuid4(), organization_id=uuid.uuid4(),
                    fields={
                        "property_id": theirs.id,
                        "service_type": SERVICE_TYPE_ELECTRICITY,
                        "provider_name": "Constellation",
                        "rate_type": RATE_TYPE_FIXED,
                    },
                    today=_TODAY,
                )


class TestRentScheduleCreate:
    async def test_a_schedule_on_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        tenant = Applicant(
            id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
            stage="lease_signed",
        )
        db.add(tenant)
        theirs = await _property(db, uuid.uuid4())

        with _uow_patched(
            db,
            "app.services.rent.rent_schedule_service",
            "app.services.rent.rent_ledger_service",
        ):
            with pytest.raises(ForeignReferenceError):
                await rent_schedule_service.create_schedule(
                    organization_id=org_id, user_id=user_id,
                    applicant_id=tenant.id, amount=Decimal("1500.00"),
                    cadence="monthly", start_date=_dt.date(2026, 8, 1),
                    today=_TODAY, property_id=theirs.id,
                )

        assert await _count(db, RentSchedule) == 0


class TestScopedLookups:
    async def test_property_labels_ignore_other_orgs(self, db: AsyncSession) -> None:
        org_id = uuid.uuid4()
        ours = await _property(db, org_id, "6734 Peerless St")
        theirs = await _property(db, uuid.uuid4(), "1 Someone Else Ln")

        labels = await property_repo.get_labels_by_ids(db, org_id, [ours.id, theirs.id])

        assert labels == {ours.id: "6734 Peerless St"}

    async def test_property_classifications_ignore_other_orgs(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        ours = await _property(db, org_id)
        theirs = await _property(db, uuid.uuid4())

        found = await property_repo.get_classifications_by_ids(
            db, org_id, [ours.id, theirs.id],
        )

        assert found == {ours.id: "INVESTMENT"}

    async def test_activity_by_property_ignores_other_orgs(
        self, db: AsyncSession,
    ) -> None:
        org_id = uuid.uuid4()
        prop = await _property(db, org_id)
        await _activity(db, uuid.uuid4(), prop.id)

        assert await activity_repo.get_by_property_id(db, prop.id, org_id) is None

    async def test_reclassify_ignores_a_foreign_activity_on_our_property(
        self, db: AsyncSession,
    ) -> None:
        """Two activities on one property used to make ``scalar_one_or_none`` 500."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _property(db, org_id)
        ours = await _activity(db, org_id, prop.id)
        foreign = await _activity(db, uuid.uuid4(), prop.id)

        with _uow_patched(db, "app.services.properties.property_service"):
            await property_service.update_property(
                worker_context(org_id, user_id), prop.id,
                {"classification": PropertyClassification.PRIMARY_RESIDENCE},
            )

        assert (ours.activity_type, ours.tax_form) == ("primary_residence", "schedule_a")
        assert (foreign.activity_type, foreign.tax_form) == ("rental_property", "schedule_e")

    async def test_renewal_sweep_names_each_plan_from_its_own_org(
        self, db: AsyncSession,
    ) -> None:
        for name in ("6734 Peerless St", "6738 Peerless St"):
            org_id = uuid.uuid4()
            prop = await _property(db, org_id, name)
            await utility_plan_repo.create(
                db, user_id=uuid.uuid4(), organization_id=org_id,
                property_id=prop.id, service_type=SERVICE_TYPE_ELECTRICITY,
                provider_name="Constellation", rate_type=RATE_TYPE_FIXED,
                service_start_date=_dt.date(2025, 1, 27),
                term_end_date=_dt.date(2026, 1, 27),
            )

        with _uow_patched(db, "app.services.properties.utility_plan_service"):
            flagged = await utility_plan_service.sweep_plans_needing_renewal(today=_TODAY)

        assert sorted(s.property_name for s in flagged) == [
            "6734 Peerless St", "6738 Peerless St",
        ]


@pytest.fixture()
def client():
    ctx = RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield TestClient(app)
    app.dependency_overrides.clear()


_REJECTED = ForeignReferenceError("property_id does not name a property")


class TestRoutesAnswer422:
    """Same status as a rejected transaction payload, never a 400 or a 500."""

    async def test_bank_csv_import(self, client: TestClient) -> None:
        with patch(
            "app.api.imports.import_service.import_bank_csv_file",
            new_callable=AsyncMock, side_effect=_REJECTED,
        ):
            response = client.post(
                f"/imports/bank-csv?property_id={uuid.uuid4()}",
                files={"file": ("chase.csv", _CHASE_CSV, "text/csv")},
            )

        assert response.status_code == 422
        assert response.json()["detail"] == str(_REJECTED)

    async def test_document_upload(self, client: TestClient) -> None:
        with patch(
            "app.api.documents.document_upload_service.accept_upload",
            new_callable=AsyncMock, side_effect=_REJECTED,
        ):
            response = client.post(
                f"/documents/upload?property_id={uuid.uuid4()}",
                files={"file": ("bill.pdf", b"%PDF-1.4", "application/pdf")},
            )

        assert response.status_code == 422

    async def test_activity_create(self, client: TestClient) -> None:
        with patch(
            "app.api.activities.activity_service.create_activity",
            new_callable=AsyncMock, side_effect=_REJECTED,
        ):
            response = client.post("/activities", json={
                "label": "Theirs", "activity_type": "rental_property",
                "tax_form": "schedule_e", "property_id": str(uuid.uuid4()),
            })

        assert response.status_code == 422

    async def test_classification_rule_create(self, client: TestClient) -> None:
        with patch(
            "app.api.classification_rules.rule_service.create_rule",
            new_callable=AsyncMock, side_effect=_REJECTED,
        ):
            response = client.post("/classification-rules", json={
                "match_type": "vendor", "match_pattern": "CenterPoint",
                "category": "utilities", "property_id": str(uuid.uuid4()),
            })

        assert response.status_code == 422

    async def test_rent_schedule_create(self, client: TestClient) -> None:
        with patch(
            "app.api.rent_ledger.rent_schedule_service.create_schedule",
            new_callable=AsyncMock, side_effect=_REJECTED,
        ):
            response = client.post("/rent-ledger/schedules", json={
                "applicant_id": str(uuid.uuid4()), "amount": "1500.00",
                "cadence": "monthly", "start_date": "2026-08-01",
                "today": _dt.date.today().isoformat(),
                "property_id": str(uuid.uuid4()),
            })

        assert response.status_code == 422
        assert response.json()["detail"] == str(_REJECTED)
