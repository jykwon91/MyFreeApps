"""The tax advisor only answers for tax returns that belong to the caller's organization."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import tax_returns as tax_returns_routes
from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.repositories.tax import tax_advisor_repo
from app.schemas.tax.tax_advisor import SuggestionStatusUpdate, TaxSuggestion
from app.services.tax import tax_advisor_service
from app.services.tax.tax_advisor_persistence import save_advice


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.tax.tax_advisor_service.AsyncSessionLocal", _fake_session),
        patch("app.services.tax.tax_advisor_service.unit_of_work", _fake_session),
    ):
        yield


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _other_org_with_advice(db: AsyncSession, user: User) -> TaxReturn:
    other_org = Organization(id=uuid.uuid4(), name="Other Org", created_by=user.id)
    db.add(other_org)
    await db.flush()
    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=other_org.id, tax_year=2031)
    db.add(tax_return)
    await db.flush()
    await save_advice(
        db,
        organization_id=other_org.id,
        tax_return_id=tax_return.id,
        user_id=user.id,
        suggestions=[TaxSuggestion(
            id="s1", category="deduction_gap", severity="high", title="t",
            description="d", estimated_savings=1, action="a", confidence="medium",
        )],
        model_version="secret-model",
    )
    await db.commit()
    return tax_return


class TestAdvisorOrgScope:
    @pytest.mark.asyncio
    async def test_another_orgs_return_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        foreign = await _other_org_with_advice(db, test_user)

        with pytest.raises(HTTPException) as exc_info:
            await tax_returns_routes.get_cached_advice(foreign.id, ctx=_ctx(test_org.id, test_user))

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Tax return not found"

    @pytest.mark.asyncio
    async def test_status_update_on_another_orgs_return_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        foreign = await _other_org_with_advice(db, test_user)

        with pytest.raises(HTTPException) as exc_info:
            await tax_returns_routes.update_suggestion_status(
                foreign.id, uuid.uuid4(), SuggestionStatusUpdate(status="dismissed"),
                ctx=_ctx(test_org.id, test_user),
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_generation_query_never_returns_another_orgs_generation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        foreign = await _other_org_with_advice(db, test_user)

        assert await tax_advisor_repo.get_latest_generation(db, foreign.id, test_org.id) is None
        assert await tax_advisor_repo.get_latest_generation(db, foreign.id, foreign.organization_id) is not None

    @pytest.mark.asyncio
    async def test_own_return_still_returns_its_advice(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        own = TaxReturn(id=uuid.uuid4(), organization_id=test_org.id, tax_year=2031)
        db.add(own)
        await db.flush()
        await save_advice(
            db, organization_id=test_org.id, tax_return_id=own.id, user_id=test_user.id,
            suggestions=[TaxSuggestion(
                id="s1", category="deduction_gap", severity="high", title="mine",
                description="d", estimated_savings=1, action="a", confidence="medium",
            )],
            model_version="my-model",
        )
        await db.commit()

        result = await tax_advisor_service.get_cached_advice(test_org.id, own.id)

        assert result is not None
        assert result.model_version == "my-model"
        assert [s.title for s in result.suggestions] == ["mine"]
