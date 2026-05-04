import type { NavItem } from "@/shared/lib/constants";

export interface NavGroup {
  /** Section header label. ``null`` renders the group with no header (used for Dashboard). */
  label: string | null;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [{ to: "/", label: "Dashboard" }],
  },
  {
    label: "Property",
    items: [
      { to: "/properties", label: "Properties" },
      { to: "/listings", label: "Listings" },
      { to: "/insurance-policies", label: "Insurance" },
      { to: "/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Tenancy",
    items: [
      { to: "/inquiries", label: "Inquiries" },
      { to: "/applicants", label: "Applicants" },
      { to: "/tenants", label: "Tenants" },
      { to: "/leases", label: "Leases" },
      { to: "/lease-templates", label: "Lease Templates" },
      { to: "/payment-review", label: "Payment Review" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/transactions", label: "Transactions" },
      { to: "/documents", label: "Documents" },
      { to: "/reconciliation", label: "Reconciliation" },
      { to: "/vendors", label: "Vendors" },
      { to: "/analytics", label: "Analytics" },
    ],
  },
  {
    label: "Tax",
    items: [
      { to: "/tax", label: "Tax Report" },
      { to: "/tax-documents", label: "Tax Documents" },
      { to: "/tax-returns", label: "Tax Returns" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/integrations", label: "Integrations" },
      { to: "/members", label: "Members", orgAdmin: true },
      { to: "/security", label: "Security" },
    ],
  },
] as const;

/**
 * Flat NAV is preserved for any existing callers (tests, etc.) that import
 * the original list. Sidebar rendering uses ``NAV_GROUPS``.
 */
export const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
