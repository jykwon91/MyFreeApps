import { baseApi as platformBaseApi } from "@platform/ui/store/baseApi";
// Registers the URLs whose 401 must not sign out, before any query can run.
import "@/shared/lib/api";

export const tagTypes = [
  "Document", "Property", "Summary", "Integration", "Auth", "AdminUsers", "AdminStats",
  "AdminOrgs", "Organization", "Members", "Invites", "Transaction", "BookingStatement",
  "Reconciliation", "TaxReturn", "ClassificationRule", "Health", "Cost", "TaxProfile",
  "Demo", "TaxAdvisor", "Totp", "Listing", "Inquiry", "ReplyTemplate", "Applicant",
  "Vendor", "Screening", "Channel", "ChannelListing", "Calendar", "BlackoutAttachments",
  "LeaseTemplate", "SignedLease", "ReviewQueue", "InsurancePolicy", "AttributionQueue",
  "WelcomeManual", "WelcomeManualSend", "UtilityPlan", "MarketRateBenchmark",
  "InsuranceBenchmark", "Mortgage", "RentLedger", "RentReminder",
] as const;

export type AppTag = (typeof tagTypes)[number];

// Background work (Gmail sync, extraction) mutates server data while the user is on
// another page or tab. The base API refetches subscribed queries when the window regains
// focus or the network reconnects, as the safety net for any invalidation we fail to
// wire explicitly. That requires setupListeners() in main.tsx.
export const baseApi = platformBaseApi.enhanceEndpoints({ addTagTypes: tagTypes });
