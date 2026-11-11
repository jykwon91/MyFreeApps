"""POST/PATCH /companies store a normalised ``primary_domain``.

Regression: a capitalised domain failed ``chk_company_domain_lowercase`` and
the service mapped every ``IntegrityError`` to "already exists" (409). Now the
schemas normalise (or 422) the domain, and only a ``uq_company_user_domain``
violation becomes a 409; any other integrity error propagates.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_update_request import CompanyUpdateRequest
from app.services.company import company_service


async def _stored_domain(db: AsyncSession, company_id: str) -> str | None:
    result = await db.execute(
        select(Company.primary_domain).where(Company.id == uuid.UUID(company_id)),
    )
    return result.scalar_one()


class TestCreateNormalizesDomain:
    @pytest.mark.asyncio
    async def test_capitalised_domain_is_created_lowercase(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "primary_domain": "Acme.com"})

        assert resp.status_code == 201, resp.text
        assert resp.json()["primary_domain"] == "acme.com"
        assert await _stored_domain(db, resp.json()["id"]) == "acme.com"

    @pytest.mark.asyncio
    async def test_url_is_reduced_to_host(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/companies",
                json={"name": "Acme", "primary_domain": "https://www.Acme.com/careers"},
            )

        assert resp.status_code == 201, resp.text
        assert await _stored_domain(db, resp.json()["id"]) == "acme.com"

    @pytest.mark.asyncio
    async def test_idn_is_stored_as_punycode(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Bücher", "primary_domain": "Bücher.de"})

        assert resp.status_code == 201, resp.text
        assert await _stored_domain(db, resp.json()["id"]) == "xn--bcher-kva.de"

    @pytest.mark.asyncio
    async def test_long_careers_url_is_accepted(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        url = "https://www.acme.com/careers?" + "&".join(f"utm_{i}=campaign" for i in range(40))
        assert len(url) > 255
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "primary_domain": url})

        assert resp.status_code == 201, resp.text
        assert await _stored_domain(db, resp.json()["id"]) == "acme.com"

    @pytest.mark.asyncio
    async def test_input_over_the_raw_bound_is_422(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/companies", json={"name": "Acme", "primary_domain": "acme.com/" + "x" * 2048},
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_sharp_s_is_encoded_like_browsers(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Straße", "primary_domain": "straße.de"})

        assert resp.status_code == 201, resp.text
        assert await _stored_domain(db, resp.json()["id"]) == "xn--strae-oqa.de"

    @pytest.mark.asyncio
    async def test_blank_domain_is_stored_as_null(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "primary_domain": "   "})

        assert resp.status_code == 201, resp.text
        assert await _stored_domain(db, resp.json()["id"]) is None

    @pytest.mark.asyncio
    async def test_same_domain_in_other_spelling_is_409(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            first = await authed.post("/companies", json={"name": "Acme", "primary_domain": "acme.com"})
            assert first.status_code == 201, first.text
            upper = await authed.post("/companies", json={"name": "Acme 2", "primary_domain": "ACME.com"})
            url = await authed.post(
                "/companies", json={"name": "Acme 3", "primary_domain": "https://www.acme.com/jobs"},
            )

        assert upper.status_code == 409, upper.text
        assert url.status_code == 409, url.text

    @pytest.mark.asyncio
    async def test_other_users_same_domain_is_allowed(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        alice = await user_factory()
        bob = await user_factory()
        async with await as_user(alice) as authed:
            assert (await authed.post("/companies", json={"name": "Acme", "primary_domain": "acme.com"})).status_code == 201
        async with await as_user(bob) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "primary_domain": "Acme.com"})

        assert resp.status_code == 201, resp.text

    @pytest.mark.asyncio
    @pytest.mark.parametrize("bad", ["not a domain", "localhost", "127.0.0.1", "acme..com"])
    async def test_invalid_host_is_422(
        self, bad: str, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "primary_domain": bad})

        assert resp.status_code == 422, resp.text
        assert "primary_domain must be a website domain" in resp.text

    @pytest.mark.asyncio
    async def test_invalid_size_range_is_422_not_409(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json={"name": "Acme", "size_range": "huge"})

        assert resp.status_code == 422, resp.text
        assert "size_range must be one of" in resp.text


class TestUpdateNormalizesDomain:
    @pytest.mark.asyncio
    async def test_update_stores_normalised_domain(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = await authed.post("/companies", json={"name": "Acme"})
            company_id = created.json()["id"]
            resp = await authed.patch(
                f"/companies/{company_id}", json={"primary_domain": "https://WWW.Acme.com/about"},
            )
            long_resp = await authed.patch(
                f"/companies/{company_id}",
                json={"primary_domain": "https://acme.com/about/" + "x" * 400},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["primary_domain"] == "acme.com"
        assert long_resp.status_code == 200, long_resp.text
        assert await _stored_domain(db, company_id) == "acme.com"

    @pytest.mark.asyncio
    async def test_update_to_other_spelling_of_existing_domain_is_409(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            await authed.post("/companies", json={"name": "Acme", "primary_domain": "acme.com"})
            other = await authed.post("/companies", json={"name": "Other", "primary_domain": "other.com"})
            resp = await authed.patch(
                f"/companies/{other.json()['id']}", json={"primary_domain": "ACME.com"},
            )

        assert resp.status_code == 409, resp.text

    @pytest.mark.asyncio
    async def test_update_invalid_host_is_422(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = await authed.post("/companies", json={"name": "Acme"})
            resp = await authed.patch(
                f"/companies/{created.json()['id']}", json={"primary_domain": "not a domain"},
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_update_blank_clears_domain(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = await authed.post("/companies", json={"name": "Acme", "primary_domain": "acme.com"})
            company_id = created.json()["id"]
            resp = await authed.patch(f"/companies/{company_id}", json={"primary_domain": " "})

        assert resp.status_code == 200, resp.text
        assert await _stored_domain(db, company_id) is None

    @pytest.mark.asyncio
    async def test_update_invalid_size_range_is_422(
        self, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            created = await authed.post("/companies", json={"name": "Acme"})
            resp = await authed.patch(f"/companies/{created.json()['id']}", json={"size_range": "huge"})

        assert resp.status_code == 422, resp.text


class TestOtherIntegrityErrorsAreNotDuplicates:
    @pytest.mark.asyncio
    async def test_create_fk_violation_propagates(self, db: AsyncSession) -> None:
        request = CompanyCreateRequest(name="Ghost", primary_domain="ghost.com")

        # No such user: the users FK fails, which must not read as "already exists".
        with pytest.raises(IntegrityError):
            await company_service.create_company(db, uuid.uuid4(), request)

    @pytest.mark.asyncio
    async def test_update_check_violation_propagates(
        self, db: AsyncSession, user_factory: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        company = await company_service.create_company(
            db, user_id, CompanyCreateRequest(name="Acme", primary_domain="acme.com"),
        )
        # Bypass schema validation to reach the DB CHECK constraint.
        request = CompanyUpdateRequest.model_construct(size_range="huge")
        request.__pydantic_fields_set__ = {"size_range"}

        with pytest.raises(IntegrityError):
            await company_service.update_company(db, user_id, company.id, request)

    @pytest.mark.asyncio
    async def test_create_duplicate_still_maps_to_duplicate_error(
        self, db: AsyncSession, user_factory: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        await company_service.create_company(
            db, user_id, CompanyCreateRequest(name="Acme", primary_domain="acme.com"),
        )

        with pytest.raises(company_service.DuplicatePrimaryDomainError):
            await company_service.create_company(
                db, user_id, CompanyCreateRequest(name="Acme 2", primary_domain="Acme.com"),
            )


class TestOrmWritesAreNormalised:
    def test_model_normalises_on_assignment(self) -> None:
        company = Company(user_id=uuid.uuid4(), name="Acme", primary_domain="https://www.Acme.com/x")
        assert company.primary_domain == "acme.com"
        company.primary_domain = "  "
        assert company.primary_domain is None

    def test_model_rejects_non_domain(self) -> None:
        with pytest.raises(ValueError, match="primary_domain must be a website domain"):
            Company(user_id=uuid.uuid4(), name="Acme", primary_domain="not a domain")
