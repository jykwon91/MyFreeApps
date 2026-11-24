"""GET /users/me/export covers every domain, with real values, and nothing it shouldn't.

Seeded world:
- User U and teammate T are members of workspace W; U exports W.
- Workspace X belongs to someone else; U is not a member.

U's export must carry U's applicants, leases, rent, insurance, mortgages, accounts,
vendors, utility accounts, the workspace's listings, inquiries, tax data,
payer aliases and welcome manuals, with encrypted PII decrypted and tax IDs
masked as the app shows them. The taxpayer profile, which the app shows only
to owners and admins, is exported only to them. Soft-deleted rows in scope (and the children of
a soft-deleted parent) are still stored, so they are exported too, with
``deleted_at`` set. It must NOT carry T's per-user rows (applicants, vendors,
leases, mortgages, utility accounts, ...) or anything from X, deleted or not,
or any secret or value the app never shows (full tax IDs, the Gmail address).
"""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.security import encrypt_pii
from app.db.session import get_db
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.documents.document import Document
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.integrations.integration import Integration
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.organization.taxpayer_profile import TaxpayerProfile
from app.models.properties.property import Property
from app.models.properties.utility_account_link import UtilityAccountLink
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_schedule import RentSchedule
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.payer_alias import PayerAlias
from app.models.user.user import User
from app.models.vendors.vendor import Vendor
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.models.welcome_manuals.welcome_manual_send import WelcomeManualSend

_SECRETS = {
    "hashed_password": "$2b$12$exportsecrethashvalue000000",
    "totp_secret": "TOTPSECRETVALUE",
    "access_token": "ya29.SECRET-ACCESS-TOKEN",
    "refresh_token": "1//SECRET-REFRESH-TOKEN",
    "share_token": "SHARETOKENSECRET1234567890",
    "share_pin": "PIN-4321-SECRET",
    "ical_import_url": "https://airbnb.example/calendar/ical/SECRETFEED.ics",
    "ical_import_secret_token": "IMPORTSECRETTOKEN",
    "ical_export_token": "EXPORTFEEDSECRETTOKEN0000000000",
    "file_storage_key": "documents/SECRET-DOC-PATH.pdf",
    "id_document_storage_key": "applicants/SECRET-ID-PATH.png",
    "attachment_storage_key": "leases/SECRET-LEASE-PATH.pdf",
    "ssn": "123-45-6789",
    "employee_ssn": "987-65-4321",
    "issuer_ein": "12-3456789",
    "gmail_address": "me.mailbox@gmail.example",
}


_DELETED_AT = datetime(2026, 1, 1, tzinfo=UTC)
_DELETED_AT_WALL_CLOCK = "2026-01-01T00:00:00"


def _user(email: str) -> User:
    return User(
        id=uuid.uuid4(), email=email, hashed_password=_SECRETS["hashed_password"],
        is_active=True, is_superuser=False, is_verified=True,
    )


async def _seed(db: AsyncSession) -> tuple[User, Organization]:
    me, teammate, outsider = _user("me@example.com"), _user("teammate@example.com"), _user("out@example.com")
    me.totp_secret = _SECRETS["totp_secret"]
    db.add_all([me, teammate, outsider])
    ws = Organization(id=uuid.uuid4(), name="Shared Workspace", created_by=me.id)
    other = Organization(id=uuid.uuid4(), name="Other Workspace", created_by=outsider.id)
    db.add_all([ws, other])
    await db.flush()
    db.add_all([
        OrganizationMember(organization_id=ws.id, user_id=me.id, org_role="owner"),
        OrganizationMember(organization_id=ws.id, user_id=teammate.id, org_role="user"),
        OrganizationMember(organization_id=other.id, user_id=outsider.id, org_role="owner"),
    ])

    prop = Property(id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, name="Maple House", address="1 Maple St")
    other_prop = Property(id=uuid.uuid4(), organization_id=other.id, user_id=outsider.id, name="Elsewhere Flat")
    db.add_all([prop, other_prop])

    # Workspace-wide domains: listings (one by the teammate), inquiries, tax, welcome manuals.
    my_listing = Listing(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, property_id=prop.id,
        title="Sunny Room", monthly_rate=Decimal("1200.00"), room_type="private_room",
    )
    teammate_listing = Listing(
        id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id, property_id=prop.id,
        title="Teammate Garden Room", monthly_rate=Decimal("900.00"), room_type="private_room",
    )
    other_listing = Listing(
        id=uuid.uuid4(), organization_id=other.id, user_id=outsider.id, property_id=other_prop.id,
        title="Outsider Loft", monthly_rate=Decimal("2000.00"), room_type="whole_unit",
    )
    deleted_listing = Listing(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, property_id=prop.id,
        title="Retired Attic Room", monthly_rate=Decimal("700.00"), room_type="private_room",
        deleted_at=_DELETED_AT,
    )
    other_deleted_listing = Listing(
        id=uuid.uuid4(), organization_id=other.id, user_id=outsider.id, property_id=other_prop.id,
        title="Outsider Deleted Loft", monthly_rate=Decimal("1500.00"), room_type="whole_unit",
        deleted_at=_DELETED_AT,
    )
    db.add_all([my_listing, teammate_listing, other_listing, deleted_listing, other_deleted_listing])
    db.add(ChannelListing(
        id=uuid.uuid4(), listing_id=deleted_listing.id, channel_id="vrbo",
        external_url="https://vrbo.example/rooms/retired",
    ))
    db.add(ChannelListing(
        id=uuid.uuid4(), listing_id=my_listing.id, channel_id="airbnb",
        external_url="https://airbnb.example/rooms/1",
        ical_import_url=_SECRETS["ical_import_url"],
        ical_import_secret_token=_SECRETS["ical_import_secret_token"],
        ical_export_token=_SECRETS["ical_export_token"],
    ))

    inquiry = Inquiry(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, listing_id=my_listing.id,
        source="direct", received_at=datetime(2026, 3, 1, tzinfo=UTC),
        inquirer_name="Casey Inquirer", inquirer_email="casey@example.com",
        stage="new", submitted_via="manual_entry", spam_status="unscored",
    )
    other_inquiry = Inquiry(
        id=uuid.uuid4(), organization_id=other.id, user_id=outsider.id,
        source="direct", received_at=datetime(2026, 3, 1, tzinfo=UTC),
        inquirer_name="Outsider Inquirer", stage="new", submitted_via="manual_entry", spam_status="unscored",
    )
    db.add_all([inquiry, other_inquiry])
    db.add_all([
        InquiryMessage(
            id=uuid.uuid4(), inquiry_id=inquiry.id, direction="inbound", channel="email",
            parsed_body="Is the room still available?",
        ),
        InquiryMessage(
            id=uuid.uuid4(), inquiry_id=other_inquiry.id, direction="inbound", channel="email",
            parsed_body="Outsider message body",
        ),
    ])

    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=ws.id, tax_year=2025)
    other_return = TaxReturn(id=uuid.uuid4(), organization_id=other.id, tax_year=2024)
    db.add_all([tax_return, other_return])
    form = TaxFormInstance(
        id=uuid.uuid4(), tax_return_id=tax_return.id, form_name="w2", source_type="manual",
        issuer_ein=_SECRETS["issuer_ein"], issuer_name="Acme Employer",
    )
    db.add(form)
    db.add_all([
        TaxFormField(
            id=uuid.uuid4(), form_instance_id=form.id, field_id="box_1",
            field_label="Wages", value_numeric=Decimal("54321.00"),
        ),
        TaxFormField(
            id=uuid.uuid4(), form_instance_id=form.id, field_id="employee_ssn",
            field_label="Employee SSN", value_text=_SECRETS["employee_ssn"],
        ),
    ])
    db.add(TaxpayerProfile(
        id=uuid.uuid4(), organization_id=ws.id, filer_type="primary",
        encrypted_ssn=encrypt_pii(_SECRETS["ssn"]), ssn_last_four="6789",
        encrypted_first_name=encrypt_pii("Jordan"), encrypted_city=encrypt_pii("Austin"),
    ))

    manual = WelcomeManual(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, property_id=prop.id,
        title="House Guide", share_token=_SECRETS["share_token"], share_pin=_SECRETS["share_pin"],
    )
    db.add(manual)
    db.add(WelcomeManualSection(id=uuid.uuid4(), manual_id=manual.id, title="Wi-Fi", body="Network: MapleNet"))
    db.add(WelcomeManualSend(
        id=uuid.uuid4(), manual_id=manual.id, recipient_email="guest@example.com",
        recipient_name="Guest Person", status="sent",
    ))

    # Per-user domains: mine are exported, the teammate's are not.
    my_applicant = Applicant(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, inquiry_id=inquiry.id,
        legal_name="Riley Applicant", dob="1990-01-02", contact_phone="555-0100",
        id_document_storage_key=_SECRETS["id_document_storage_key"], stage="approved",
    )
    teammate_applicant = Applicant(
        id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id,
        legal_name="Teammate Applicant", stage="lead",
    )
    db.add_all([my_applicant, teammate_applicant])

    my_lease = SignedLease(
        id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, applicant_id=my_applicant.id,
        listing_id=my_listing.id, kind="imported", status="signed",
        starts_on=date(2026, 4, 1), ends_on=date(2027, 3, 31), notes="My signed lease notes",
    )
    teammate_lease = SignedLease(
        id=uuid.uuid4(), user_id=teammate.id, organization_id=ws.id, applicant_id=teammate_applicant.id,
        kind="imported", status="draft", notes="Teammate lease notes",
    )
    db.add_all([my_lease, teammate_lease])
    db.add_all([
        SignedLeaseAttachment(
            id=uuid.uuid4(), lease_id=my_lease.id, storage_key=_SECRETS["attachment_storage_key"],
            filename="signed-lease.pdf", content_type="application/pdf", size_bytes=2048,
            kind="signed_lease", uploaded_by_user_id=me.id,
        ),
        SignedLeaseAttachment(
            id=uuid.uuid4(), lease_id=teammate_lease.id, storage_key="leases/teammate.pdf",
            filename="teammate-lease.pdf", content_type="application/pdf", size_bytes=1024,
            kind="signed_lease", uploaded_by_user_id=teammate.id,
        ),
    ])
    db.add_all([
        LeaseTemplate(id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, name="My Standard Lease"),
        LeaseTemplate(id=uuid.uuid4(), user_id=teammate.id, organization_id=ws.id, name="Teammate Template"),
    ])

    schedule = RentSchedule(
        id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, applicant_id=my_applicant.id,
        property_id=prop.id, amount=Decimal("1200.00"), cadence="monthly", start_date=date(2026, 4, 1),
    )
    db.add(schedule)
    db.add(RentCharge(
        id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, applicant_id=my_applicant.id,
        schedule_id=schedule.id, charge_type="rent", period_start=date(2026, 4, 1),
        period_end=date(2026, 4, 30), due_date=date(2026, 4, 1), amount=Decimal("1200.00"),
    ))

    db.add_all([
        Vendor(id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, name="Ace Plumbing", category="plumber"),
        Vendor(id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id, name="Teammate Handyman", category="handyman"),
        Vendor(id=uuid.uuid4(), organization_id=other.id, user_id=me.id, name="Old Workspace Vendor", category="cleaner"),
        Vendor(
            id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, name="Deleted Vendor", category="pest",
            deleted_at=_DELETED_AT,
        ),
        Vendor(
            id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id, name="Teammate Deleted Vendor",
            category="locksmith", deleted_at=_DELETED_AT,
        ),
    ])
    db.add_all([
        InsurancePolicy(
            id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, property_id=prop.id,
            policy_name="Landlord Policy", carrier="Acme Mutual", policy_number="POL-777",
        ),
        Mortgage(
            id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, property_id=prop.id,
            lender="First Bank", account_number="ACCT-998877", rate_type="fixed",
        ),
        Mortgage(
            id=uuid.uuid4(), user_id=teammate.id, organization_id=ws.id, property_id=prop.id,
            lender="Teammate Credit Union", rate_type="fixed",
        ),
        FinancialAccount(
            id=uuid.uuid4(), user_id=me.id, organization_id=ws.id, name="My Checking",
            account_type="checking", mask="4821",
        ),
        FinancialAccount(
            id=uuid.uuid4(), user_id=teammate.id, organization_id=ws.id, name="Teammate Checking",
            account_type="checking",
        ),
    ])

    integration = Integration(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, provider="gmail",
        gmail_address=_SECRETS["gmail_address"], metadata_={"gmail_label": "Rentals"},
    )
    integration.access_token = _SECRETS["access_token"]
    integration.refresh_token = _SECRETS["refresh_token"]
    db.add(integration)
    db.add_all([
        UtilityAccountLink(
            id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, property_id=prop.id,
            sender_domain="power.example", account_number="MY-POWER-1111", source="auto_learn",
        ),
        UtilityAccountLink(
            id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id, property_id=prop.id,
            sender_domain="water.example", account_number="TEAMMATE-WATER-2222", source="auto_learn",
        ),
        PayerAlias(
            id=uuid.uuid4(), organization_id=ws.id, user_id=teammate.id,
            normalized_payer_name="teammate payer", applicant_id=teammate_applicant.id, source="confirm",
        ),
    ])
    db.add(Document(
        id=uuid.uuid4(), organization_id=ws.id, user_id=me.id, file_name="receipt.pdf",
        file_type="pdf", status="processed", file_storage_key=_SECRETS["file_storage_key"],
    ))
    await db.commit()
    return me, ws


async def _export(
    db: AsyncSession, user: User, org: Organization, org_role: OrgRole = OrgRole.OWNER,
) -> tuple[dict, str]:
    ctx = RequestContext(organization_id=org.id, user_id=user.id, org_role=org_role)
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[get_db] = lambda: db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    return response.json(), response.text


def _values(data: dict, section: str, key: str) -> list:
    return [row[key] for row in data[section]]


def _live(data: dict, section: str, key: str) -> list:
    return [row[key] for row in data[section] if row["deleted_at"] is None]


@pytest.mark.anyio
async def test_export_includes_every_new_domain_with_real_values(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, _ = await _export(db, me, ws)

    [applicant] = data["applicants"]
    assert applicant["legal_name"] == "Riley Applicant"
    assert applicant["dob"] == "1990-01-02"
    assert applicant["contact_phone"] == "555-0100"
    assert _values(data, "signed_leases", "notes") == ["My signed lease notes"]
    assert data["signed_leases"][0]["starts_on"] == "2026-04-01"
    assert _values(data, "signed_lease_attachments", "filename") == ["signed-lease.pdf"]
    assert _values(data, "lease_templates", "name") == ["My Standard Lease"]
    assert _values(data, "inquiries", "inquirer_name") == ["Casey Inquirer"]
    assert _values(data, "inquiry_messages", "parsed_body") == ["Is the room still available?"]
    assert _values(data, "tax_returns", "tax_year") == [2025]
    assert _values(data, "tax_form_instances", "form_name") == ["w2"]
    assert "54321.00" in _values(data, "tax_form_fields", "value_numeric")
    [taxpayer] = data["taxpayer_profiles"]
    assert (taxpayer["first_name"], taxpayer["city"], taxpayer["ssn_last_four"]) == ("Jordan", "Austin", "6789")
    assert _values(data, "insurance_policies", "policy_number") == ["POL-777"]
    assert _values(data, "mortgages", "account_number") == ["ACCT-998877"]
    assert _values(data, "financial_accounts", "name") == ["My Checking"]
    assert _live(data, "vendors", "name") == ["Ace Plumbing"]
    assert _values(data, "welcome_manuals", "title") == ["House Guide"]
    assert _values(data, "welcome_manual_sections", "body") == ["Network: MapleNet"]
    assert _values(data, "welcome_manual_sends", "recipient_email") == ["guest@example.com"]
    assert _values(data, "rent_schedules", "amount") == ["1200.00"]
    assert _values(data, "rent_charges", "due_date") == ["2026-04-01"]
    assert "https://airbnb.example/rooms/1" in _values(data, "channel_listings", "external_url")
    [integration] = data["integrations"]
    assert (integration["provider"], integration["gmail_label"]) == ("gmail", "Rentals")
    assert _values(data, "utility_account_link", "account_number") == ["MY-POWER-1111"]
    assert _values(data, "organizations", "name") == ["Shared Workspace"]


@pytest.mark.anyio
async def test_export_includes_teammates_workspace_wide_rows(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, _ = await _export(db, me, ws)

    assert sorted(_live(data, "listings", "title")) == ["Sunny Room", "Teammate Garden Room"]
    assert _values(data, "payer_alias", "normalized_payer_name") == ["teammate payer"]


@pytest.mark.anyio
async def test_export_includes_soft_deleted_rows_marked_deleted(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, _ = await _export(db, me, ws)

    # SQLite drops the timezone, so compare the wall-clock part.
    deleted_vendors = {row["name"]: row["deleted_at"][:19] for row in data["vendors"] if row["deleted_at"]}
    assert deleted_vendors == {"Deleted Vendor": _DELETED_AT_WALL_CLOCK}
    deleted_listings = {row["title"]: row for row in data["listings"] if row["deleted_at"]}
    assert list(deleted_listings) == ["Retired Attic Room"]
    assert deleted_listings["Retired Attic Room"]["deleted_at"][:19] == _DELETED_AT_WALL_CLOCK
    children = [row for row in data["channel_listings"] if row["external_url"] == "https://vrbo.example/rooms/retired"]
    assert [row["listing_id"] for row in children] == [deleted_listings["Retired Attic Room"]["id"]]


@pytest.mark.anyio
async def test_export_excludes_teammates_per_user_rows(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    _, body = await _export(db, me, ws)

    for teammate_value in (
        "Teammate Applicant", "Teammate lease notes", "teammate-lease.pdf",
        "Teammate Template", "Teammate Handyman", "Teammate Credit Union", "Teammate Deleted Vendor",
        "TEAMMATE-WATER-2222", "water.example",
    ):
        assert teammate_value not in body


@pytest.mark.anyio
async def test_export_excludes_other_workspaces_rows(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, body = await _export(db, me, ws)

    for foreign_value in (
        "Outsider Loft", "Outsider Inquirer", "Outsider message body", "Elsewhere Flat",
        "Old Workspace Vendor", "Other Workspace", "Outsider Deleted Loft",
    ):
        assert foreign_value not in body
    assert _values(data, "tax_returns", "tax_year") == [2025]


@pytest.mark.anyio
async def test_export_contains_no_secret(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, body = await _export(db, me, ws)

    for secret in _SECRETS.values():
        assert secret not in body
    for column in (
        "hashed_password", "totp_secret", "access_token_encrypted", "refresh_token_encrypted",
        "share_token", "share_pin", "ical_export_token", "ical_import_url", "file_storage_key",
        "id_document_storage_key", "storage_key", "encrypted_ssn", "key_version", "gmail_address",
        "metadata",
    ):
        assert f'"{column}"' not in body
    assert data["documents"][0]["file_name"] == "receipt.pdf"


@pytest.mark.anyio
async def test_export_masks_tax_ids_as_the_app_shows_them(db: AsyncSession) -> None:
    me, ws = await _seed(db)
    data, _ = await _export(db, me, ws)

    [form] = data["tax_form_instances"]
    assert form["issuer_ein"] == "***6789"
    fields = {row["field_id"]: row["value_text"] for row in data["tax_form_fields"]}
    assert fields["employee_ssn"] == "***4321"


@pytest.mark.anyio
@pytest.mark.parametrize("org_role", [OrgRole.USER, OrgRole.VIEWER])
async def test_taxpayer_profiles_are_left_out_for_roles_the_app_denies(
    db: AsyncSession, org_role: OrgRole,
) -> None:
    me, ws = await _seed(db)
    data, body = await _export(db, me, ws, org_role)

    assert "taxpayer_profiles" not in data
    assert "Jordan" not in body
    assert _values(data, "tax_returns", "tax_year") == [2025]


@pytest.mark.anyio
@pytest.mark.parametrize("org_role", [OrgRole.OWNER, OrgRole.ADMIN])
async def test_taxpayer_profiles_are_exported_to_owners_and_admins(
    db: AsyncSession, org_role: OrgRole,
) -> None:
    me, ws = await _seed(db)
    data, _ = await _export(db, me, ws, org_role)

    assert _values(data, "taxpayer_profiles", "first_name") == ["Jordan"]
