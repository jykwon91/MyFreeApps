"""Every field an update schema accepts must be one its service will write.

A PATCH schema that advertises a field the service allowlist rejects answers
a valid request with "Cannot update field". The two are written apart, so they
drift; this fails the moment they do.
"""
import pytest
from pydantic import BaseModel

from app.models.requests.property_update import PropertyUpdate
from app.schemas.listings.listing_external_id_update_request import ListingExternalIdUpdateRequest
from app.schemas.organization.activity import ActivityUpdate
from app.schemas.organization.tax_profile import TaxProfileUpdate
from app.schemas.tax.tax_year_profile import TaxYearProfileUpdate
from app.schemas.transactions.transaction import TransactionUpdate
from app.repositories.listings.listing_external_id_repo import _UPDATABLE_COLUMNS as LISTING_EXTERNAL_ID_COLUMNS
from app.services.organization.activity_service import UPDATABLE_FIELDS as ACTIVITY_FIELDS
from app.services.organization.tax_profile_service import UPDATABLE_FIELDS as TAX_PROFILE_FIELDS
from app.services.properties.property_service import UPDATABLE_FIELDS as PROPERTY_FIELDS
from app.services.tax.tax_year_profile_service import UPDATABLE_FIELDS as TAX_YEAR_PROFILE_FIELDS
from app.services.transactions.transaction_service import UPDATABLE_FIELDS as TRANSACTION_FIELDS

# Schema fields a service intentionally does not write through its allowlist.
# Each needs a reason; an empty set means none.
SCHEMA_ONLY_FIELDS: dict[str, frozenset[str]] = {}

PAIRS: list[tuple[str, type[BaseModel], frozenset[str]]] = [
    ("transaction", TransactionUpdate, TRANSACTION_FIELDS),
    ("property", PropertyUpdate, PROPERTY_FIELDS),
    ("activity", ActivityUpdate, ACTIVITY_FIELDS),
    ("tax_profile", TaxProfileUpdate, TAX_PROFILE_FIELDS),
    ("tax_year_profile", TaxYearProfileUpdate, TAX_YEAR_PROFILE_FIELDS),
    ("listing_external_id", ListingExternalIdUpdateRequest, LISTING_EXTERNAL_ID_COLUMNS),
]


@pytest.mark.parametrize(("name", "schema", "allowed"), PAIRS, ids=[p[0] for p in PAIRS])
def test_every_schema_field_is_updatable(
    name: str, schema: type[BaseModel], allowed: frozenset[str],
) -> None:
    rejected = set(schema.model_fields) - allowed - SCHEMA_ONLY_FIELDS.get(name, frozenset())
    assert not rejected, f"{schema.__name__} accepts fields the service rejects: {sorted(rejected)}"


@pytest.mark.parametrize(("name", "schema", "allowed"), PAIRS, ids=[p[0] for p in PAIRS])
def test_schema_only_exclusions_are_still_schema_fields(
    name: str, schema: type[BaseModel], allowed: frozenset[str],
) -> None:
    stale = SCHEMA_ONLY_FIELDS.get(name, frozenset()) - set(schema.model_fields)
    assert not stale, f"{name} excludes fields the schema no longer has: {sorted(stale)}"
