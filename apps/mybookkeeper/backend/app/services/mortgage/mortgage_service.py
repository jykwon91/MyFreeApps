"""Service layer for mortgages.

CRUD only — the market comparison lives in ``mortgage_rate_watch_service``.

All data access is through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Any

from app.db.session import unit_of_work
from app.repositories.mortgage import mortgage_repo
from app.repositories.properties import property_repo
from app.schemas.mortgage.mortgage_list_response import MortgageListResponse
from app.schemas.mortgage.mortgage_response import MortgageResponse
from app.schemas.mortgage.mortgage_validation import validate_mortgage_fields
from app.services.documents.document_ownership import owns_document
from app.services.mortgage._merged_mortgage import MergedMortgage
from app.services.properties.property_ownership import owns_property


class MortgageNotFoundError(LookupError):
    pass


class InvalidMortgageError(ValueError):
    """A payload that would leave the stored row internally inconsistent."""


async def _assert_property_is_ours(
    db, *, organization_id: uuid.UUID, property_id: uuid.UUID,
) -> None:
    if not await owns_property(
        db, organization_id=organization_id, property_id=property_id,
    ):
        raise InvalidMortgageError("property_id does not name a property")


async def _assert_source_document_is_ours(
    db, *, organization_id: uuid.UUID, document_id: uuid.UUID | None,
) -> None:
    if document_id is None:
        return
    if not await owns_document(
        db, organization_id=organization_id, document_id=document_id,
    ):
        raise InvalidMortgageError("source_document_id does not name a document")


def _to_response(mortgage, property_name: str | None = None) -> MortgageResponse:
    """Attach the property's display name to a stored row.

    ``property_name`` is joined in by the service rather than stored on the
    mortgage, so it has to be grafted on after validation. ``update`` belongs
    to ``model_copy``, not ``model_validate`` — passing it to the latter raises
    ``TypeError`` at runtime, which is invisible until a real row is returned.
    """
    return MortgageResponse.model_validate(mortgage).model_copy(
        update={"property_name": property_name},
    )


async def create_mortgage(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    rate_type: str,
    source_document_id: uuid.UUID | None,
    lender: str | None,
    account_number: str | None,
    current_balance_cents: int | None,
    statement_date: _dt.date | None,
    original_principal_cents: int | None,
    interest_rate: Decimal | None,
    fixed_until: _dt.date | None,
    maturity_date: _dt.date | None,
    term_months: int | None,
    monthly_principal_cents: int | None,
    monthly_interest_cents: int | None,
    monthly_escrow_cents: int | None,
    notes: str | None,
) -> MortgageResponse:
    async with unit_of_work() as db:
        await _assert_property_is_ours(
            db, organization_id=organization_id, property_id=property_id,
        )
        await _assert_source_document_is_ours(
            db, organization_id=organization_id, document_id=source_document_id,
        )
        mortgage = await mortgage_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            rate_type=rate_type,
            source_document_id=source_document_id,
            lender=lender,
            account_number=account_number,
            current_balance_cents=current_balance_cents,
            statement_date=statement_date,
            original_principal_cents=original_principal_cents,
            interest_rate=interest_rate,
            fixed_until=fixed_until,
            maturity_date=maturity_date,
            term_months=term_months,
            monthly_principal_cents=monthly_principal_cents,
            monthly_interest_cents=monthly_interest_cents,
            monthly_escrow_cents=monthly_escrow_cents,
            notes=notes,
        )
        names = await property_repo.get_name_map(db, organization_id)
        return _to_response(mortgage, names.get(property_id))


async def get_mortgage(
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> MortgageResponse:
    async with unit_of_work() as db:
        mortgage = await mortgage_repo.get(
            db,
            mortgage_id=mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if mortgage is None:
            raise MortgageNotFoundError(str(mortgage_id))
        names = await property_repo.get_name_map(db, organization_id)
        return _to_response(mortgage, names.get(mortgage.property_id))


async def list_mortgages(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> MortgageListResponse:
    async with unit_of_work() as db:
        rows = await mortgage_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            limit=limit,
            offset=offset,
        )
        total = await mortgage_repo.count_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
        )
        names = await property_repo.get_name_map(db, organization_id)
        return MortgageListResponse(
            items=[_to_response(r, names.get(r.property_id)) for r in rows],
            total=total,
            has_more=offset + len(rows) < total,
        )


async def update_mortgage(
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> MortgageResponse:
    async with unit_of_work() as db:
        mortgage = await mortgage_repo.get(
            db,
            mortgage_id=mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if mortgage is None:
            raise MortgageNotFoundError(str(mortgage_id))

        if "property_id" in fields:
            await _assert_property_is_ours(
                db,
                organization_id=organization_id,
                property_id=fields["property_id"],
            )
        if "source_document_id" in fields:
            await _assert_source_document_is_ours(
                db,
                organization_id=organization_id,
                document_id=fields["source_document_id"],
            )

        # The patch is checked against what the row WOULD become, not against
        # what it sent — clearing one half of a pair is the case a body-only
        # check cannot see.
        try:
            validate_mortgage_fields(MergedMortgage(mortgage, fields))
        except ValueError as exc:
            raise InvalidMortgageError(str(exc)) from exc

        updated = await mortgage_repo.update_mortgage(
            db,
            mortgage_id=mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
            fields=fields,
        )
        if updated is None:
            raise MortgageNotFoundError(str(mortgage_id))
        names = await property_repo.get_name_map(db, organization_id)
        return _to_response(updated, names.get(updated.property_id))


async def delete_mortgage(
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        deleted = await mortgage_repo.soft_delete(
            db,
            mortgage_id=mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if not deleted:
            raise MortgageNotFoundError(str(mortgage_id))
