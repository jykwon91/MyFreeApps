"""Every table the account data export reads, and which of its rows it reads.

The export covers one workspace (the one the request is made in). Each table's
scope mirrors how the app lets the requesting user read it:

* Tables every workspace member reads in the app (properties, listings,
  inquiries, welcome manuals, tax returns, payer aliases, the rent
  attribution review queue, ...) are exported workspace-wide.
* Tables the app shows only to the member who owns the row (applicants and
  everything about them, rent schedules and charges, signed leases and
  templates, vendors, insurance policies, mortgages, financial accounts, utility plans and the
  utility accounts learned from their bills, reply templates, calendar review
  items) are exported only when they are the requesting user's.
* A table whose read endpoint requires a role (taxpayer profiles: owner or
  admin) is exported only to members holding that role.
* Documents and transactions are exported only when the requesting user
  created them, as the export did before it covered every table.
* Child tables follow their parent, so a child is exported exactly when its
  parent is.

Parents are listed before their children. Soft-deleted rows, and the
children of a soft-deleted parent, are exported like any other row (they are
still stored); their ``deleted_at`` value marks them as deleted.
"""
from typing import Final

from app.core.account_export_scope import AccountExportScope as Scope
from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.applicants.reference import Reference
from app.models.applicants.screening_result import ScreeningResult
from app.models.applicants.video_call_note import VideoCallNote
from app.models.budgets.spending_budget import SpendingBudget
from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.models.calendar.calendar_listing_blocklist import CalendarListingBlocklist
from app.models.classification.classification_rule import ClassificationRule
from app.models.documents.document import Document
from app.models.extraction.extraction_prompt import ExtractionPrompt
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.transactions.spending_category import SpendingCategory
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.inquiries.inquiry_spam_assessment import InquirySpamAssessment
from app.models.inquiries.reply_template import ReplyTemplate
from app.models.insurance.insurance_benchmark import InsuranceBenchmark
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment
from app.models.integrations.integration import Integration
from app.models.integrations.plaid_item import PlaidItem
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder
from app.models.leases.lease_term_version import LeaseTermVersion
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.leases.signed_lease_template import SignedLeaseTemplate
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.listings.listing_blackout_attachment import ListingBlackoutAttachment
from app.models.listings.listing_external_id import ListingExternalId
from app.models.listings.listing_photo import ListingPhoto
from app.models.mortgage.mortgage import Mortgage
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.models.organization.activity import Activity
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.organization.tax_profile import TaxProfile
from app.models.organization.taxpayer_profile import TaxpayerProfile
from app.models.properties.activity_period import ActivityPeriod
from app.models.properties.lease import Lease
from app.models.properties.market_rate_benchmark import MarketRateBenchmark
from app.models.properties.property import Property
from app.models.properties.tenant import Tenant
from app.models.properties.utility_account_link import UtilityAccountLink
from app.models.properties.utility_plan import UtilityPlan
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.models.tax.cost_basis_lot import CostBasisLot
from app.models.tax.estimated_tax_payment import EstimatedTaxPayment
from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.models.tax.tax_carryforward import TaxCarryforward
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.tax.tax_year_profile import TaxYearProfile
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.loan_payee import LoanPayee
from app.models.transactions.payer_alias import PayerAlias
from app.models.transactions.personal_transfer_sender import PersonalTransferSender
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.vendors.vendor import Vendor
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_place import WelcomeManualPlace
from app.models.welcome_manuals.welcome_manual_room import WelcomeManualRoom
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.models.welcome_manuals.welcome_manual_section_field import (
    WelcomeManualSectionField,
)
from app.models.welcome_manuals.welcome_manual_section_image import (
    WelcomeManualSectionImage,
)
from app.models.welcome_manuals.welcome_manual_send import WelcomeManualSend
from app.repositories.user.account_export_source import AccountExportSource as Source

# The taxpayer profile endpoints require one of these roles.
_OWNER_OR_ADMIN: Final = frozenset({OrgRole.OWNER, OrgRole.ADMIN})

ACCOUNT_EXPORT_SOURCES: Final[tuple[Source, ...]] = (
    # Workspace and account settings
    Source(Organization, Scope.WORKSPACE_ITSELF),
    Source(OrganizationMember, Scope.WORKSPACE_MEMBER),
    Source(TaxProfile, Scope.WORKSPACE),
    Source(TaxpayerProfile, Scope.WORKSPACE, read_roles=_OWNER_OR_ADMIN),
    Source(Activity, Scope.WORKSPACE),
    Source(ClassificationRule, Scope.WORKSPACE),
    Source(Integration, Scope.WORKSPACE),
    Source(ExtractionPrompt, Scope.USER),
    # Properties
    Source(Property, Scope.WORKSPACE),
    Source(ActivityPeriod, Scope.CHILD, Property, "property_id"),
    Source(Tenant, Scope.WORKSPACE),
    Source(Lease, Scope.CHILD, Property, "property_id"),
    Source(UtilityAccountLink, Scope.WORKSPACE_MEMBER),
    Source(UtilityPlan, Scope.WORKSPACE_MEMBER),
    Source(MarketRateBenchmark, Scope.WORKSPACE),
    # Listings and calendar
    Source(Listing, Scope.WORKSPACE),
    Source(ListingPhoto, Scope.CHILD, Listing, "listing_id"),
    Source(ListingExternalId, Scope.CHILD, Listing, "listing_id"),
    Source(ListingBlackout, Scope.CHILD, Listing, "listing_id"),
    Source(ListingBlackoutAttachment, Scope.CHILD, ListingBlackout, "listing_blackout_id"),
    Source(ChannelListing, Scope.CHILD, Listing, "listing_id"),
    Source(CalendarEmailReviewQueue, Scope.WORKSPACE_MEMBER),
    Source(CalendarListingBlocklist, Scope.WORKSPACE_MEMBER),
    # Inquiries
    Source(Inquiry, Scope.WORKSPACE),
    Source(InquiryEvent, Scope.CHILD, Inquiry, "inquiry_id"),
    Source(InquiryMessage, Scope.CHILD, Inquiry, "inquiry_id"),
    Source(InquiryReplySend, Scope.CHILD, Inquiry, "inquiry_id"),
    Source(InquirySpamAssessment, Scope.CHILD, Inquiry, "inquiry_id"),
    Source(ReplyTemplate, Scope.WORKSPACE_MEMBER),
    # Applicants and vendors
    Source(Applicant, Scope.WORKSPACE_MEMBER),
    Source(ApplicantEvent, Scope.CHILD, Applicant, "applicant_id"),
    Source(Reference, Scope.CHILD, Applicant, "applicant_id"),
    Source(ScreeningResult, Scope.CHILD, Applicant, "applicant_id"),
    Source(VideoCallNote, Scope.CHILD, Applicant, "applicant_id"),
    Source(Vendor, Scope.WORKSPACE_MEMBER),
    # Leases
    Source(LeaseTemplate, Scope.WORKSPACE_MEMBER),
    Source(LeaseTemplateFile, Scope.CHILD, LeaseTemplate, "template_id"),
    Source(LeaseTemplatePlaceholder, Scope.CHILD, LeaseTemplate, "template_id"),
    Source(SignedLease, Scope.WORKSPACE_MEMBER),
    Source(SignedLeaseAttachment, Scope.CHILD, SignedLease, "lease_id"),
    Source(SignedLeaseTemplate, Scope.CHILD, SignedLease, "lease_id"),
    Source(LeaseTermVersion, Scope.CHILD, SignedLease, "lease_id"),
    Source(PendingRentReceipt, Scope.WORKSPACE_MEMBER),
    # Rent
    Source(RentSchedule, Scope.WORKSPACE_MEMBER),
    Source(RentCharge, Scope.WORKSPACE_MEMBER),
    Source(RentReminderPlan, Scope.WORKSPACE_MEMBER),
    Source(RentReminderSend, Scope.WORKSPACE_MEMBER),
    Source(PayerAlias, Scope.WORKSPACE),
    Source(PersonalTransferSender, Scope.WORKSPACE),
    Source(RentAttributionReviewQueue, Scope.WORKSPACE),
    # Documents and transactions
    Source(Document, Scope.WORKSPACE_MEMBER),
    Source(Transaction, Scope.WORKSPACE_MEMBER),
    Source(TransactionDocument, Scope.CHILD, Transaction, "transaction_id"),
    Source(BookingStatement, Scope.WORKSPACE),
    Source(ReconciliationSource, Scope.WORKSPACE),
    Source(ReconciliationMatch, Scope.CHILD, ReconciliationSource, "reconciliation_source_id"),
    # Tax
    Source(TaxReturn, Scope.WORKSPACE),
    Source(TaxYearProfile, Scope.WORKSPACE),
    Source(TaxFormInstance, Scope.CHILD, TaxReturn, "tax_return_id"),
    Source(TaxFormField, Scope.CHILD, TaxFormInstance, "form_instance_id"),
    Source(TaxFormFieldSource, Scope.CHILD, TaxFormField, "field_id"),
    Source(TaxCarryforward, Scope.WORKSPACE),
    Source(TaxAdvisorGeneration, Scope.WORKSPACE),
    Source(TaxAdvisorSuggestion, Scope.WORKSPACE),
    Source(CostBasisLot, Scope.WORKSPACE),
    Source(EstimatedTaxPayment, Scope.WORKSPACE),
    # Insurance and mortgages
    Source(InsurancePolicy, Scope.WORKSPACE_MEMBER),
    Source(InsurancePolicyAttachment, Scope.CHILD, InsurancePolicy, "policy_id"),
    Source(InsuranceBenchmark, Scope.WORKSPACE),
    Source(Mortgage, Scope.WORKSPACE_MEMBER),
    Source(FinancialAccount, Scope.WORKSPACE_MEMBER),
    Source(PlaidItem, Scope.WORKSPACE_MEMBER),
    Source(BalanceSnapshot, Scope.WORKSPACE_MEMBER),
    Source(Security, Scope.WORKSPACE_MEMBER),
    Source(Holding, Scope.WORKSPACE_MEMBER),
    Source(SpendingCategory, Scope.WORKSPACE),
    Source(SpendingBudget, Scope.WORKSPACE),
    Source(LoanPayee, Scope.WORKSPACE),
    # Welcome manuals
    Source(WelcomeManual, Scope.WORKSPACE),
    Source(WelcomeManualRoom, Scope.CHILD, WelcomeManual, "manual_id"),
    Source(WelcomeManualSection, Scope.CHILD, WelcomeManual, "manual_id"),
    Source(WelcomeManualSectionField, Scope.CHILD, WelcomeManualSection, "section_id"),
    Source(WelcomeManualSectionImage, Scope.CHILD, WelcomeManualSection, "section_id"),
    Source(WelcomeManualPlace, Scope.CHILD, WelcomeManual, "manual_id"),
    Source(WelcomeManualSend, Scope.CHILD, WelcomeManual, "manual_id"),
)
