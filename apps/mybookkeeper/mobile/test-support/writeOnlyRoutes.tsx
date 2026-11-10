import type { ReactElement } from "react";
import { BANK_IMPORT_MESSAGES } from "../src/constants/bankImport";
import { FORM_MESSAGES } from "../src/constants/forms";
import { INSURANCE_MESSAGES } from "../src/constants/insurance";
import { LEASE_DOCUMENT_MESSAGES } from "../src/constants/leaseDocuments";
import { LEASE_IMPORT_MESSAGES } from "../src/constants/leaseImport";
import { MARKET_RATE_MESSAGES } from "../src/constants/marketRates";
import { MORTGAGE_FORM_MESSAGES } from "../src/constants/mortgageForm";
import { RECEIPTS_MESSAGES } from "../src/constants/receipts";
import { REPLY_TEMPLATE_MESSAGES } from "../src/constants/replyTemplates";
import { UTILITY_PLAN_FORM_MESSAGES } from "../src/constants/utilityPlanForm";
import ApplicantPickerScreen from "../src/features/newLease/ApplicantPickerScreen";
import BankImportScreen from "../src/features/bankImport/BankImportScreen";
import ChannelListingFormGate from "../src/features/listings/ChannelListingFormGate";
import AddDocumentPickScreen from "../src/features/leases/AddDocumentPickScreen";
import AddDocumentValuesScreen from "../src/features/leases/AddDocumentValuesScreen";
import EditPolicyScreen from "../src/features/insurance/EditPolicyScreen";
import InquiryReplyScreen from "../src/features/inquiries/InquiryReplyScreen";
import LeaseImportScreen from "../src/features/leaseImport/LeaseImportScreen";
import LeaseTemplateCreateScreen from "../src/features/leaseTemplates/LeaseTemplateCreateScreen";
import ListingCreateScreen from "../src/features/listings/ListingCreateScreen";
import ListingEditScreen from "../src/features/listings/ListingEditScreen";
import ListingLinkCreateScreen from "../src/features/listings/ListingLinkCreateScreen";
import ListingLinkEditScreen from "../src/features/listings/ListingLinkEditScreen";
import MarketRateFormScreen from "../src/features/utilityPlans/MarketRateFormScreen";
import MortgageEditScreen from "../src/features/mortgages/MortgageEditScreen";
import MortgageFormScreen from "../src/features/mortgages/MortgageFormScreen";
import NewLeaseDetailsScreen from "../src/features/newLease/NewLeaseDetailsScreen";
import NewPolicyScreen from "../src/features/insurance/NewPolicyScreen";
import NewTransactionScreen from "../src/features/transactions/NewTransactionScreen";
import PlaceholderEditScreen from "../src/features/leaseTemplates/PlaceholderEditScreen";
import PromoteScreen from "../src/features/applicants/PromoteScreen";
import PropertyCreateScreen from "../src/features/properties/PropertyCreateScreen";
import PropertyEditScreen from "../src/features/properties/PropertyEditScreen";
import ReconciliationAddScreen from "../src/features/reconciliation/ReconciliationAddScreen";
import ReplyTemplateCreateScreen from "../src/features/replyTemplates/ReplyTemplateCreateScreen";
import ReplyTemplateEditScreen from "../src/features/replyTemplates/ReplyTemplateEditScreen";
import SendReceiptScreen from "../src/features/receipts/SendReceiptScreen";
import TemplatePickerScreen from "../src/features/newLease/TemplatePickerScreen";
import TransactionEditScreen from "../src/features/transactions/TransactionEditScreen";
import UtilityPlanEditScreen from "../src/features/utilityPlans/UtilityPlanEditScreen";
import UtilityPlanFormScreen from "../src/features/utilityPlans/UtilityPlanFormScreen";
import VendorCreateScreen from "../src/features/vendors/VendorCreateScreen";
import VendorEditScreen from "../src/features/vendors/VendorEditScreen";
import WelcomeManualCreateScreen from "../src/features/welcomeManuals/WelcomeManualCreateScreen";
import WelcomeManualEditScreen from "../src/features/welcomeManuals/WelcomeManualEditScreen";
import WelcomeManualEmailScreen from "../src/features/welcomeManuals/WelcomeManualEmailScreen";
import WelcomeManualSectionCreateScreen from "../src/features/welcomeManuals/WelcomeManualSectionCreateScreen";
import WelcomeManualSectionEditScreen from "../src/features/welcomeManuals/WelcomeManualSectionEditScreen";

export interface WriteOnlyRoute {
  /** The route file under app/(app), without the extension. */
  route: string;
  /** The heading a viewer is shown in place of the screen. */
  heading: string;
  screen: ReactElement;
}

const FLOW = { templateIds: ["t1"], applicantId: "a1" };

/** Every phone route whose only purpose is to create or change something. Each has to turn a viewer away itself. */
export const WRITE_ONLY_ROUTES: readonly WriteOnlyRoute[] = [
  { route: "transactions/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <NewTransactionScreen /> },
  { route: "transactions/[id]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <TransactionEditScreen id="t1" /> },
  { route: "transactions/import", heading: BANK_IMPORT_MESSAGES.title, screen: <BankImportScreen /> },
  { route: "inquiries/[id]/promote", heading: FORM_MESSAGES.viewOnlyHeading, screen: <PromoteScreen id="i1" /> },
  { route: "inquiries/[id]/reply", heading: FORM_MESSAGES.viewOnlyHeading, screen: <InquiryReplyScreen id="i1" /> },
  { route: "leases/new/index", heading: FORM_MESSAGES.viewOnlyHeading, screen: <TemplatePickerScreen flow={{ templateIds: [] }} /> },
  { route: "leases/new/applicant", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ApplicantPickerScreen flow={{ templateIds: ["t1"] }} /> },
  { route: "leases/new/details", heading: FORM_MESSAGES.viewOnlyHeading, screen: <NewLeaseDetailsScreen flow={FLOW} /> },
  { route: "leases/import", heading: LEASE_IMPORT_MESSAGES.title, screen: <LeaseImportScreen /> },
  { route: "leases/[id]/add-document/index", heading: LEASE_DOCUMENT_MESSAGES.pickTitle, screen: <AddDocumentPickScreen leaseId="l1" /> },
  { route: "leases/[id]/add-document/details", heading: LEASE_DOCUMENT_MESSAGES.pickTitle, screen: <AddDocumentValuesScreen leaseId="l1" templateIds={["t1"]} /> },
  { route: "vendors/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <VendorCreateScreen /> },
  { route: "vendors/[id]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <VendorEditScreen id="v1" /> },
  { route: "properties/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <PropertyCreateScreen /> },
  { route: "properties/[id]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <PropertyEditScreen id="p1" /> },
  { route: "mortgages/new", heading: MORTGAGE_FORM_MESSAGES.viewOnlyHeading, screen: <MortgageFormScreen /> },
  { route: "mortgages/[id]/edit", heading: MORTGAGE_FORM_MESSAGES.viewOnlyHeading, screen: <MortgageEditScreen id="m1" /> },
  { route: "listings/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ListingCreateScreen /> },
  { route: "listings/[id]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ListingEditScreen id="li1" /> },
  { route: "listings/[id]/links/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ListingLinkCreateScreen id="li1" /> },
  { route: "listings/[id]/links/[linkId]", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ListingLinkEditScreen id="li1" linkId="k1" /> },
  { route: "listings/[id]/channels/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ChannelListingFormGate id="li1" /> },
  { route: "listings/[id]/channels/[channelListingId]", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ChannelListingFormGate channelListingId="c1" id="li1" /> },
  { route: "lease-templates/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <LeaseTemplateCreateScreen /> },
  { route: "lease-templates/[id]/placeholders/[placeholderId]", heading: FORM_MESSAGES.viewOnlyHeading, screen: <PlaceholderEditScreen placeholderId="ph1" templateId="t1" /> },
  { route: "reconciliation/add", heading: FORM_MESSAGES.viewOnlyHeading, screen: <ReconciliationAddScreen year={2025} /> },
  { route: "reply-templates/new", heading: REPLY_TEMPLATE_MESSAGES.viewOnlyHeading, screen: <ReplyTemplateCreateScreen /> },
  { route: "reply-templates/[id]/edit", heading: REPLY_TEMPLATE_MESSAGES.viewOnlyHeading, screen: <ReplyTemplateEditScreen id="r1" /> },
  { route: "utility-plans/new", heading: UTILITY_PLAN_FORM_MESSAGES.viewOnlyHeading, screen: <UtilityPlanFormScreen /> },
  { route: "utility-plans/market-rates/[serviceType]", heading: MARKET_RATE_MESSAGES.viewOnlyHeading, screen: <MarketRateFormScreen serviceType="electricity" /> },
  { route: "utility-plans/[id]/edit", heading: UTILITY_PLAN_FORM_MESSAGES.viewOnlyHeading, screen: <UtilityPlanEditScreen id="u1" /> },
  { route: "insurance/new", heading: INSURANCE_MESSAGES.notAllowed, screen: <NewPolicyScreen /> },
  { route: "insurance/[id]/edit", heading: INSURANCE_MESSAGES.notAllowed, screen: <EditPolicyScreen id="in1" /> },
  { route: "welcome-manuals/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <WelcomeManualCreateScreen /> },
  { route: "welcome-manuals/[id]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <WelcomeManualEditScreen id="w1" /> },
  { route: "welcome-manuals/[id]/email", heading: FORM_MESSAGES.viewOnlyHeading, screen: <WelcomeManualEmailScreen manualId="w1" /> },
  { route: "welcome-manuals/[id]/sections/new", heading: FORM_MESSAGES.viewOnlyHeading, screen: <WelcomeManualSectionCreateScreen manualId="w1" /> },
  { route: "welcome-manuals/[id]/sections/[sectionId]/edit", heading: FORM_MESSAGES.viewOnlyHeading, screen: <WelcomeManualSectionEditScreen manualId="w1" sectionId="s1" /> },
  { route: "receipts/[transactionId]", heading: RECEIPTS_MESSAGES.viewOnlyHeading, screen: <SendReceiptScreen transactionId="t1" /> },
];

/** Create and edit looking routes that don't use the shared write guard, and why. */
export const WRITE_GUARD_EXEMPTIONS: Readonly<Record<string, string>> = {
  "security/turn-on": "Per-user two-step sign-in, not workspace data, so every member may use it.",
  "tax-returns/new": "Owners and admins only, enforced by useIsAdmin (a stricter rule than write access).",
  "tax-returns/[id]/override": "Owners and admins only, enforced by useIsAdmin (a stricter rule than write access).",
  camera: "Redirects a viewer to Money instead of showing a message.",
  "(tabs)/capture": "Renders nothing: the tab only opens the camera route.",
};
