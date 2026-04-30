import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "./baseQuery";

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery,
  tagTypes: ["Document", "Property", "Summary", "Integration", "Auth", "AdminUsers", "AdminStats", "AdminOrgs", "Organization", "Members", "Invites", "Transaction", "Reservation", "Reconciliation", "TaxReturn", "PlaidItem", "PlaidAccount", "ClassificationRule", "Health", "Cost", "TaxProfile", "Demo", "TaxAdvisor", "Totp", "Listing", "Inquiry", "ReplyTemplate", "Applicant", "Vendor", "Screening", "Channel", "ChannelListing"],
  endpoints: () => ({}),
});
