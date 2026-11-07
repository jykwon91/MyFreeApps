"""Tests for the test-only tax seed route."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.test_helpers.tax_seed import _SeedFormInstanceRequest, seed_form_instance


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.tax_seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture()
def test_mode():
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    yield
    settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _make_return(db: AsyncSession, org_id: uuid.UUID) -> TaxReturn:
    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=org_id, tax_year=2031)
    db.add(tax_return)
    await db.commit()
    return tax_return


class TestSeedFormInstance:
    @pytest.mark.asyncio
    async def test_adds_a_manual_instance_to_my_return(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        seeded = await seed_form_instance(
            tax_return.id,
            _SeedFormInstanceRequest(form_name="w2", instance_label="Acme Corp"),
            ctx=_ctx(test_org.id, test_user),
        )

        instance = (await db.execute(select(TaxFormInstance).where(TaxFormInstance.id == seeded.id))).scalar_one()
        assert instance.tax_return_id == tax_return.id
        assert instance.form_name == "w2"
        assert instance.source_type == "manual"
        assert instance.instance_label == "Acme Corp"

    @pytest.mark.asyncio
    async def test_another_organizations_return_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        with pytest.raises(HTTPException) as exc_info:
            await seed_form_instance(
                tax_return.id,
                _SeedFormInstanceRequest(form_name="w2"),
                ctx=_ctx(uuid.uuid4(), test_user),
            )
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_form_instance(
                    tax_return.id,
                    _SeedFormInstanceRequest(form_name="w2"),
                    ctx=_ctx(test_org.id, test_user),
                )
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None
