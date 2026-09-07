import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "./baseQuery";

export const tagTypes = [
  "Document", "Property", "Summary", "Integration", "Auth", "AdminUsers", "AdminStats",
  "AdminOrgs", "Organization", "Members", "Invites", "Transaction", "BookingStatement",
  "Reconciliation", "TaxReturn", "ClassificationRule", "Health", "Cost", "TaxProfile",
  "Demo", "TaxAdvisor", "Totp", "Listing", "Inquiry", "ReplyTemplate", "Applicant",
  "Vendor", "Screening", "Channel", "ChannelListing", "Calendar", "BlackoutAttachments",
  "LeaseTemplate", "SignedLease", "ReviewQueue", "InsurancePolicy", "AttributionQueue",
  "WelcomeManual", "WelcomeManualSend", "UtilityPlan", "MarketRateBenchmark",
  "InsuranceBenchmark", "Mortgage", "RentLedger",
] as const;

export type AppTag = (typeof tagTypes)[number];

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery,
  tagTypes,
  // Background work (Gmail sync, extraction) mutates server data while the user
  // is on another page or another tab. Refetching subscribed queries when the
  // window regains focus or the network reconnects is the safety net for any
  // invalidation we fail to wire explicitly. Requires setupListeners() in main.tsx.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
