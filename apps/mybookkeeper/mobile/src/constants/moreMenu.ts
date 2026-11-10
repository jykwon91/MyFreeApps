import type { MoreMenuGroup } from "../types/MoreMenuGroup";
import { PRIVACY_POLICY_PATH } from "./aiPermission";

export const MORE_MENU: readonly MoreMenuGroup[] = [
  {
    title: "Rentals",
    items: [
      { label: "Calendar", webPath: "/calendar", screen: "/calendar", keywords: ["bookings", "airbnb", "availability", "schedule", "stays"] },
      { label: "Listings", screen: "/listings", keywords: ["rooms", "vacancy", "rental ads", "photos", "airbnb", "furnished finder"] },
      { label: "Properties", screen: "/properties", keywords: ["houses", "buildings", "addresses", "units"] },
      { label: "Welcome Manuals", screen: "/welcome-manuals", keywords: ["guide", "guest", "house rules", "wifi", "check in"] },
      { label: "Reply Templates", screen: "/reply-templates", keywords: ["messages", "canned", "responses", "inquiry replies"] },
    ],
  },
  {
    title: "Leasing",
    items: [
      { label: "Leases", webPath: "/leases", screen: "/leases", keywords: ["rent", "agreements", "tenancy", "contracts", "signed", "renewal"] },
      { label: "Lease Templates", screen: "/lease-templates", keywords: ["contracts", "agreements", "placeholders", "rent"] },
      { label: "Payment Review", screen: "/payment-review", keywords: ["attribution", "rent payments", "venmo", "zelle", "who paid", "rent"] },
      { label: "Rent Receipts", screen: "/receipts", keywords: ["pending receipts", "payments", "tenant paid", "proof of payment"] },
    ],
  },
  {
    title: "Money tools",
    items: [
      { label: "Property P&L", screen: "/property-pnl", keywords: ["profit", "loss", "income statement", "earnings", "pnl"] },
      { label: "Reconciliation", screen: "/reconciliation", keywords: ["bank statement", "match", "balance", "reconcile"] },
      { label: "Vendors", screen: "/vendors", keywords: ["contractors", "suppliers", "plumber", "payees", "1099"] },
      { label: "Vendor rules", screen: "/vendor-rules", keywords: ["classification", "auto categorize", "categorization", "payee rules"] },
      { label: "Money analysis", screen: "/analytics/money", keywords: ["spending", "trends", "charts", "compare", "income", "expenses"] },
      { label: "Utility costs", screen: "/analytics", keywords: ["electric", "gas", "water", "internet", "bills", "analytics"] },
      { label: "Insurance", screen: "/insurance", keywords: ["policies", "premium", "coverage", "renewal"] },
      { label: "Mortgages", screen: "/mortgages", keywords: ["loans", "interest", "escrow", "refinance", "payments"] },
      { label: "Utility Plans", screen: "/utility-plans", keywords: ["electric", "gas", "water", "internet", "contracts", "rates"] },
    ],
  },
  {
    title: "Tax",
    items: [
      { label: "Tax Report", screen: "/tax", keywords: ["schedule e", "taxes", "deductions", "income report", "irs"] },
      { label: "Tax Documents", screen: "/tax/documents", keywords: ["1099", "w-2", "1098", "k-1", "forms", "irs", "schedule e"] },
      { label: "Tax Returns", screen: "/tax-returns", keywords: ["1040", "filing", "federal", "state", "schedule e", "irs"] },
      { label: "Tax Review", screen: "/tax/review", keywords: ["check", "forms", "1099", "schedule e", "irs", "accuracy"] },
    ],
  },
  {
    title: "Privacy",
    items: [
      { label: "Claude and my documents", screen: "/ai-permission", keywords: ["ai", "permission", "privacy", "reading", "consent"] },
      { label: "Privacy policy", webPath: PRIVACY_POLICY_PATH, keywords: ["terms", "data", "legal"] },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Integrations", screen: "/integrations", keywords: ["gmail", "email", "connect", "sync", "accounts"] },
      { label: "Members", screen: "/members", access: "admin", keywords: ["team", "invite", "users", "roles", "access", "co-owner"] },
      { label: "Security", screen: "/security", keywords: ["two-factor", "2fa", "totp", "password", "recovery codes", "sign in", "passkey"] },
    ],
  },
];
