"""Every field an update schema accepts must be one its service will write.

A PATCH schema that advertises a field the service allowlist rejects answers
a valid request with "Cannot update field". The two are written apart, so they
drift; this fails the moment they do.
"""
import pytest
from pydantic import BaseModel

from app.models.requests.property_update import PropertyUpdate
from app.repositories.inquiries.inquiry_repo import _UPDATABLE_COLUMNS as INQUIRY_COLUMNS
from app.repositories.inquiries.reply_template_repo import _UPDATABLE_COLUMNS as REPLY_TEMPLATE_COLUMNS
from app.repositories.leases.lease_template_placeholder_repo import _UPDATABLE_FIELDS as PLACEHOLDER_FIELDS
from app.repositories.listings.channel_listing_repo import _UPDATABLE_COLUMNS as CHANNEL_LISTING_COLUMNS
from app.repositories.listings.listing_photo_repo import _UPDATABLE_COLUMNS as LISTING_PHOTO_COLUMNS
from app.repositories.listings.listing_repo import _UPDATABLE_COLUMNS as LISTING_COLUMNS
from app.repositories.organization.activity_repo import _UPDATABLE_FIELDS as ACTIVITY_REPO_FIELDS
from app.repositories.organization.tax_profile_repo import _UPDATABLE_FIELDS as TAX_PROFILE_REPO_FIELDS
from app.repositories.tax.tax_year_profile_repo import _UPDATABLE_FIELDS as TAX_YEAR_PROFILE_REPO_FIELDS
from app.repositories.vendors.vendor_repo import _UPDATABLE_COLUMNS as VENDOR_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_place_repo import _UPDATABLE_COLUMNS as WM_PLACE_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_repo import _UPDATABLE_COLUMNS as WM_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_room_repo import _UPDATABLE_COLUMNS as WM_ROOM_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_section_field_repo import _UPDATABLE_COLUMNS as WM_FIELD_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_section_image_repo import _UPDATABLE_COLUMNS as WM_IMAGE_COLUMNS
from app.repositories.welcome_manuals.welcome_manual_section_repo import _UPDATABLE_COLUMNS as WM_SECTION_COLUMNS
from app.schemas.inquiries.inquiry_update_request import InquiryUpdateRequest
from app.schemas.inquiries.reply_template_update_request import ReplyTemplateUpdateRequest
from app.schemas.leases.lease_template_placeholder_update_request import LeaseTemplatePlaceholderUpdateRequest
from app.schemas.listings.channel_listing_update_request import ChannelListingUpdateRequest
from app.schemas.listings.listing_photo_update_request import ListingPhotoUpdateRequest
from app.schemas.listings.listing_update_request import ListingUpdateRequest
from app.schemas.vendors.vendor_update_request import VendorUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_place_update_request import WelcomeManualPlaceUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_room_update_request import WelcomeManualRoomUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_section_field_update_request import WelcomeManualSectionFieldUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_section_image_update_request import WelcomeManualSectionImageUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_section_update_request import WelcomeManualSectionUpdateRequest
from app.schemas.welcome_manuals.welcome_manual_update_request import WelcomeManualUpdateRequest
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
    ("activity_repo", ActivityUpdate, ACTIVITY_REPO_FIELDS),
    ("tax_profile_repo", TaxProfileUpdate, TAX_PROFILE_REPO_FIELDS),
    ("tax_year_profile_repo", TaxYearProfileUpdate, TAX_YEAR_PROFILE_REPO_FIELDS),
    ("welcome_manual", WelcomeManualUpdateRequest, WM_COLUMNS),
    ("welcome_manual_section", WelcomeManualSectionUpdateRequest, WM_SECTION_COLUMNS),
    ("welcome_manual_section_field", WelcomeManualSectionFieldUpdateRequest, WM_FIELD_COLUMNS),
    ("welcome_manual_place", WelcomeManualPlaceUpdateRequest, WM_PLACE_COLUMNS),
    ("welcome_manual_room", WelcomeManualRoomUpdateRequest, WM_ROOM_COLUMNS),
    ("welcome_manual_section_image", WelcomeManualSectionImageUpdateRequest, WM_IMAGE_COLUMNS),
    ("listing_photo", ListingPhotoUpdateRequest, LISTING_PHOTO_COLUMNS),
    ("listing", ListingUpdateRequest, LISTING_COLUMNS),
    ("channel_listing", ChannelListingUpdateRequest, CHANNEL_LISTING_COLUMNS),
    ("vendor", VendorUpdateRequest, VENDOR_COLUMNS),
    ("inquiry", InquiryUpdateRequest, INQUIRY_COLUMNS),
    ("reply_template", ReplyTemplateUpdateRequest, REPLY_TEMPLATE_COLUMNS),
    ("lease_template_placeholder", LeaseTemplatePlaceholderUpdateRequest, PLACEHOLDER_FIELDS),
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
