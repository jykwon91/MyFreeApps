import type { MoreMenuGroup } from "../types/MoreMenuGroup";
import { PRIVACY_POLICY_PATH } from "./aiPermission";

export const MORE_MENU: readonly MoreMenuGroup[] = [
  {
    title: "Rentals",
    items: [
      { label: "Calendar", webPath: "/calendar", screen: "/calendar" },
      { label: "Listings", screen: "/listings" },
      { label: "Properties", screen: "/properties" },
      { label: "Welcome Manuals", screen: "/welcome-manuals" },
      { label: "Reply Templates", screen: "/reply-templates" },
    ],
  },
  {
    title: "Leasing",
    items: [
      { label: "Leases", webPath: "/leases", screen: "/leases" },
      { label: "Lease Templates", screen: "/lease-templates" },
      { label: "Payment Review", screen: "/payment-review" },
    ],
  },
  {
    title: "Money tools",
    items: [
      { label: "Reconciliation", webPath: "/reconciliation" },
      { label: "Vendors", screen: "/vendors" },
      { label: "Analytics", webPath: "/analytics" },
      { label: "Insurance", screen: "/insurance" },
      { label: "Mortgages", screen: "/mortgages" },
      { label: "Utility Plans", screen: "/utility-plans" },
    ],
  },
  {
    title: "Tax",
    items: [
      { label: "Tax Report", webPath: "/tax" },
      { label: "Tax Documents", webPath: "/tax-documents" },
      { label: "Tax Returns", webPath: "/tax-returns" },
      { label: "Tax Review", webPath: "/tax-review" },
    ],
  },
  {
    title: "Privacy",
    items: [
      { label: "Claude and my documents", screen: "/ai-permission" },
      { label: "Privacy policy", webPath: PRIVACY_POLICY_PATH },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Integrations", webPath: "/integrations" },
      { label: "Members", webPath: "/members", adminOnly: true },
      { label: "Security", webPath: "/security" },
    ],
  },
];
