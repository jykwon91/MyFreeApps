"""``today`` placeholders and computed ``today`` resolve to the caller's local date.

Production runs in UTC, so a US host generating a lease in the evening used
to get tomorrow's date. Every request that resolves defaults now carries the
client's local date, validated to be within one day of the server's UTC date.
"""
from __future__ import annotations

import datetime
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.dates.client_local_date import ClientLocalDate
from app.schemas.leases.signed_lease_template_prefill_response import (
    SignedLeaseTemplatePrefillResponse,
)
from app.services.leases import lease_template_service
from app.services.leases.signed_lease_service import (
    SignedLeaseNotFoundError,
    add_templates_and_generate,
    generate_lease,
    prefill_addendum_placeholders,
)

# Far from any server clock, so a pass proves the passed date was used.
_CLIENT_DATE = datetime.date(2031, 3, 4)


def _utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed(db: AsyncSession, user: User, org: Organization):
    applicant = await applicant_repo.create(
        db, organization_id=org.id, user_id=user.id, legal_name="Jane Doe",
    )
    template = await lease_template_repo.create(
        db, user_id=user.id, organization_id=org.id, name="Lease",
    )
    await lease_template_placeholder_repo.create(
        db,
        template_id=template.id,
        key="EFFECTIVE DATE",
        display_label="Effective date",
        input_type="date",
        required=True,
        default_source="today",
        computed_expr=None,
        display_order=0,
    )
    await db.commit()
    return applicant, template


async def _add_computed_today(db: AsyncSession, template_id: uuid.UUID) -> None:
    """A ``SIGNED ON`` placeholder computed as ``today``, plus a file to render it into."""
    await lease_template_placeholder_repo.create(
        db,
        template_id=template_id,
        key="SIGNED ON",
        display_label="Signed on",
        input_type="computed",
        required=False,
        default_source=None,
        computed_expr="today",
        display_order=1,
    )
    await lease_template_file_repo.create(
        db,
        template_id=template_id,
        filename="lease.md",
        storage_key="lease-templates/lease.md",
        content_type="text/markdown",
        size_bytes=20,
        display_order=0,
    )
    await db.commit()


def _render_patches(db: AsyncSession, render_md: MagicMock):
    storage = MagicMock()
    storage.download_file = MagicMock(return_value=b"Signed [SIGNED ON]")
    return (
        patch("app.services.leases.lease_pdf_service.unit_of_work", _fake_uow(db)),
        patch("app.services.leases.lease_lifecycle_service.unit_of_work", _fake_uow(db)),
        patch("app.services.leases.lease_pdf_service.get_storage", return_value=storage),
        patch("app.services.leases.lease_pdf_service.render_md", render_md),
        patch("app.services.leases.lease_pdf_service.render_md_text_to_pdf_or_keep", return_value=b"%PDF"),
    )


async def _seed_lease(db: AsyncSession, user: User, org: Organization, applicant_id: uuid.UUID):
    lease = await signed_lease_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        applicant_id=applicant_id,
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="draft",
        kind="generated",
    )
    await db.commit()
    return lease


# ---------------------------------------------------------------------------
# ClientLocalDate
# ---------------------------------------------------------------------------

class TestClientLocalDate:
    _adapter = TypeAdapter(ClientLocalDate)

    @pytest.mark.parametrize("offset", [-1, 0, 1])
    def test_accepts_dates_within_one_day_of_utc(self, offset: int) -> None:
        value = _utc_today() + datetime.timedelta(days=offset)
        assert self._adapter.validate_python(value.isoformat()) == value

    @pytest.mark.parametrize("offset", [-2, 2, 400])
    def test_rejects_dates_more_than_one_day_off(self, offset: int) -> None:
        value = _utc_today() + datetime.timedelta(days=offset)
        with pytest.raises(ValidationError):
            self._adapter.validate_python(value.isoformat())


# ---------------------------------------------------------------------------
# Services: the passed date becomes the EFFECTIVE DATE
# ---------------------------------------------------------------------------

class TestServicesUseClientDate:
    @pytest.mark.asyncio
    async def test_generate_defaults(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        with patch("app.services.leases.lease_template_service.unit_of_work", _fake_uow(db)):
            defaults = await lease_template_service.generate_defaults(
                user_id=test_user.id,
                organization_id=test_org.id,
                template_id=template.id,
                applicant_id=applicant.id,
                today=_CLIENT_DATE,
            )
        assert defaults == [{"key": "EFFECTIVE DATE", "value": "2031-03-04", "provenance": "today"}]

    @pytest.mark.asyncio
    async def test_generate_defaults_multi(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        with patch("app.services.leases.lease_template_service.unit_of_work", _fake_uow(db)):
            merged = await lease_template_service.generate_defaults_multi(
                user_id=test_user.id,
                organization_id=test_org.id,
                template_ids=[template.id],
                applicant_id=applicant.id,
                today=_CLIENT_DATE,
            )
        assert [(m["value"], m["provenance"]) for m in merged] == [("2031-03-04", "today")]

    @pytest.mark.asyncio
    async def test_prefill_addendum_placeholders(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        lease = await _seed_lease(db, test_user, test_org, applicant.id)
        with patch("app.services.leases.lease_prefill_service.unit_of_work", _fake_uow(db)):
            result = await prefill_addendum_placeholders(
                user_id=test_user.id,
                organization_id=test_org.id,
                lease_id=lease.id,
                template_ids=[template.id],
                today=_CLIENT_DATE,
            )
        assert [(i.key, i.value, i.provenance) for i in result.items] == [
            ("EFFECTIVE DATE", "2031-03-04", "today"),
        ]

    @pytest.mark.asyncio
    async def test_add_templates_and_generate(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        lease = await _seed_lease(db, test_user, test_org, applicant.id)
        with patch(
            "app.services.leases.lease_pdf_service.unit_of_work", _fake_uow(db),
        ), patch(
            "app.services.leases.lease_lifecycle_service.unit_of_work", _fake_uow(db),
        ), patch(
            "app.services.leases.lease_pdf_service.get_storage", return_value=MagicMock(),
        ):
            result = await add_templates_and_generate(
                user_id=test_user.id,
                organization_id=test_org.id,
                lease_id=lease.id,
                template_ids=[template.id],
                today=_CLIENT_DATE,
            )
        assert result.values["EFFECTIVE DATE"] == "2031-03-04"

    @pytest.mark.asyncio
    async def test_add_templates_computed_today(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        await _add_computed_today(db, template.id)
        lease = await _seed_lease(db, test_user, test_org, applicant.id)
        render_md = MagicMock(return_value="rendered")
        p1, p2, p3, p4, p5 = _render_patches(db, render_md)
        with p1, p2, p3, p4, p5:
            await add_templates_and_generate(
                user_id=test_user.id,
                organization_id=test_org.id,
                lease_id=lease.id,
                template_ids=[template.id],
                today=_CLIENT_DATE,
            )
        substitutions = render_md.call_args.args[1]
        assert substitutions["SIGNED ON"] == "2031-03-04"

    @pytest.mark.asyncio
    async def test_generate_lease_computed_today(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        applicant, template = await _seed(db, test_user, test_org)
        await _add_computed_today(db, template.id)
        lease = await _seed_lease(db, test_user, test_org, applicant.id)
        await signed_lease_template_repo.create(
            db, lease_id=lease.id, template_id=template.id, display_order=0,
        )
        await db.commit()
        render_md = MagicMock(return_value="rendered")
        p1, p2, p3, p4, p5 = _render_patches(db, render_md)
        with p1, p2, p3, p4, p5:
            await generate_lease(
                user_id=test_user.id,
                organization_id=test_org.id,
                lease_id=lease.id,
                today=_CLIENT_DATE,
            )
        substitutions = render_md.call_args.args[1]
        assert substitutions["SIGNED ON"] == "2031-03-04"


# ---------------------------------------------------------------------------
# Routes: the client's date is passed through; missing or far-off is a 422
# ---------------------------------------------------------------------------

def _ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )


@pytest.fixture
def client():
    ctx = _ctx()
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _get_generate_defaults(client: TestClient, today: str | None):
    params = {"applicant_id": str(uuid.uuid4())}
    if today is not None:
        params["today"] = today
    return client.get(f"/lease-templates/{uuid.uuid4()}/generate-defaults", params=params)


def _post_multi_generate_defaults(client: TestClient, today: str | None):
    body = {"template_ids": [str(uuid.uuid4())], "applicant_id": str(uuid.uuid4())}
    if today is not None:
        body["today"] = today
    return client.post("/lease-templates/generate-defaults", json=body)


def _post_template_prefill(client: TestClient, today: str | None):
    body = {"template_ids": [str(uuid.uuid4())]}
    if today is not None:
        body["today"] = today
    return client.post(f"/signed-leases/{uuid.uuid4()}/template-prefill", json=body)


def _post_add_templates(client: TestClient, today: str | None):
    body = {"template_ids": [str(uuid.uuid4())]}
    if today is not None:
        body["today"] = today
    return client.post(f"/signed-leases/{uuid.uuid4()}/templates", json=body)


def _post_generate(client: TestClient, today: str | None):
    body = {} if today is None else {"today": today}
    return client.post(f"/signed-leases/{uuid.uuid4()}/generate", json=body)


_ROUTES = [
    (_get_generate_defaults, "app.api.lease_templates.lease_template_service.generate_defaults", []),
    (_post_multi_generate_defaults, "app.api.lease_templates.lease_template_service.generate_defaults_multi", []),
    (
        _post_template_prefill,
        "app.api.signed_leases.signed_lease_service.prefill_addendum_placeholders",
        SignedLeaseTemplatePrefillResponse(items=[]),
    ),
]


class TestRoutesRequireClientDate:
    @pytest.mark.parametrize(("call", "target", "result"), _ROUTES)
    @pytest.mark.parametrize("offset", [-1, 1])
    def test_passes_client_date_to_service(self, client, call, target, result, offset: int) -> None:
        client_today = _utc_today() + datetime.timedelta(days=offset)
        with patch(target, new_callable=AsyncMock, return_value=result) as service:
            resp = call(client, client_today.isoformat())
        assert resp.status_code == 200, resp.text
        assert service.await_args.kwargs["today"] == client_today

    @pytest.mark.parametrize(
        ("call", "target"),
        [
            (_post_add_templates, "app.api.signed_leases.signed_lease_service.add_templates_and_generate"),
            (_post_generate, "app.api.signed_leases.signed_lease_service.generate_lease"),
        ],
    )
    def test_lease_writes_pass_client_date_to_service(self, client, call, target) -> None:
        client_today = _utc_today() - datetime.timedelta(days=1)
        with patch(
            target, new_callable=AsyncMock, side_effect=SignedLeaseNotFoundError("stop here"),
        ) as service:
            resp = call(client, client_today.isoformat())
        assert resp.status_code == 404
        assert service.await_args.kwargs["today"] == client_today

    @pytest.mark.parametrize(
        "call",
        [_get_generate_defaults, _post_multi_generate_defaults, _post_template_prefill, _post_add_templates, _post_generate],
    )
    @pytest.mark.parametrize("offset", [None, -2, 2])
    def test_missing_or_far_off_date_is_422(self, client, call, offset: int | None) -> None:
        today = None if offset is None else (_utc_today() + datetime.timedelta(days=offset)).isoformat()
        resp = call(client, today)
        assert resp.status_code == 422
