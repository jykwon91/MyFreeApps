import type { MoreMenuGroup } from "@platform/mobile";
import type { MoreDestination } from "../types/MoreDestination";

/** What the tab bar reaches, so search finds it too. Titles are the tab names. */
export const TAB_DESTINATIONS: readonly MoreMenuGroup<MoreDestination>[] = [
  { title: "Home", items: [{ label: "Home", screen: "/", keywords: ["today", "alerts", "glance", "dashboard", "triage"] }] },
  {
    title: "Money",
    items: [
      { label: "Transactions", screen: "/money", keywords: ["income", "expenses", "spending", "bank", "approve", "categorize"] },
      { label: "Documents", screen: "/money?segment=documents", keywords: ["receipts", "invoices", "statements", "scans", "uploads", "files"] },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Inquiries", screen: "/people?section=inquiries", keywords: ["leads", "messages", "prospects", "new inquiry"] },
      { label: "Applicants", screen: "/people?section=applicants", keywords: ["applications", "screening", "prospects"] },
      { label: "Tenants", screen: "/people?section=tenants", keywords: ["residents", "renters", "occupants"] },
    ],
  },
];
