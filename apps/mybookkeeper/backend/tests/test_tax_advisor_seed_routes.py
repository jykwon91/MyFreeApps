"""Tests for the test-only tax advisor seed route."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.schemas.tax.tax_advisor import TaxSuggestion
from app.test_helpers.tax_advisor_seed import SEEDED_MODEL_VERSION, _SeedAdvisorRequest, seed_advisor


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.tax_advisor_seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture()
def test_mode():
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    yield
    settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


def _suggestion(sid: str, title: str) -> TaxSuggestion:
    return TaxSuggestion(
        id=sid, category="deduction_gap", severity="high", title=title,
        description="d", estimated_savings=120, action="a", confidence="medium",
    )


async def _make_return(db: AsyncSession, org_id: uuid.UUID) -> TaxReturn:
    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=org_id, tax_year=2031)
    db.add(tax_return)
    await db.commit()
    return tax_return


class TestSeedAdvisor:
    @pytest.mark.asyncio
    async def test_saves_the_suggestions_as_the_active_advice_of_my_return(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        seeded = await seed_advisor(
            tax_return.id,
            _SeedAdvisorRequest(suggestions=[_suggestion("s1", "First"), _suggestion("s2", "Second")]),
            ctx=_ctx(test_org.id, test_user),
        )

        generation = (await db.execute(
            select(TaxAdvisorGeneration).where(TaxAdvisorGeneration.id == seeded.generation_id)
        )).scalar_one()
        assert generation.tax_return_id == tax_return.id
        assert generation.organization_id == test_org.id
        assert generation.model_version == SEEDED_MODEL_VERSION
        rows = (await db.execute(
            select(TaxAdvisorSuggestion).where(TaxAdvisorSuggestion.id.in_(seeded.suggestion_ids))
        )).scalars().all()
        assert sorted(r.title for r in rows) == ["First", "Second"]
        assert {r.status for r in rows} == {"active"}
        assert {r.generation_id for r in rows} == {generation.id}

    @pytest.mark.asyncio
    async def test_reseeding_replaces_the_active_suggestions(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)
        ctx = _ctx(test_org.id, test_user)
        await seed_advisor(tax_return.id, _SeedAdvisorRequest(suggestions=[_suggestion("s1", "Old")]), ctx=ctx)

        await seed_advisor(tax_return.id, _SeedAdvisorRequest(suggestions=[_suggestion("s2", "New")]), ctx=ctx)

        active = (await db.execute(
            select(TaxAdvisorSuggestion.title).where(
                TaxAdvisorSuggestion.tax_return_id == tax_return.id,
                TaxAdvisorSuggestion.status == "active",
            )
        )).scalars().all()
        assert active == ["New"]

    @pytest.mark.asyncio
    async def test_not_found_for_a_return_in_another_organization(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        with pytest.raises(HTTPException) as exc_info:
            await seed_advisor(
                tax_return.id,
                _SeedAdvisorRequest(suggestions=[_suggestion("s1", "x")]),
                ctx=_ctx(uuid.uuid4(), test_user),
            )
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxAdvisorGeneration))).first() is None

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_advisor(
                    tax_return.id,
                    _SeedAdvisorRequest(suggestions=[_suggestion("s1", "x")]),
                    ctx=_ctx(test_org.id, test_user),
                )
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxAdvisorGeneration))).first() is None

    def test_rejects_an_empty_suggestion_list(self) -> None:
        with pytest.raises(ValidationError):
            _SeedAdvisorRequest(suggestions=[])
