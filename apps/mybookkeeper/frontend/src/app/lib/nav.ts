import type { NavItem } from "@/shared/lib/constants";

export const NAV: readonly NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/documents", label: "Documents" },
  { to: "/properties", label: "Properties" },
  { to: "/listings", label: "Listings" },
  { to: "/inquiries", label: "Inquiries" },
  { to: "/applicants", label: "Applicants" },
  { to: "/vendors", label: "Vendors" },
  { to: "/reconciliation", label: "Reconciliation" },
  { to: "/tax", label: "Tax Report" },
  { to: "/tax-documents", label: "Tax Documents" },
  { to: "/tax-returns", label: "Tax Returns" },
  { to: "/analytics", label: "Analytics" },
  { to: "/integrations", label: "Integrations" },
  { to: "/members", label: "Members", orgAdmin: true },
  { to: "/security", label: "Security" },
] as const;
