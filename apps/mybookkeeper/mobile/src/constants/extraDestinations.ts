import type { MoreMenuGroup } from "@platform/mobile";
import type { MoreDestination } from "../types/MoreDestination";
import { MORE_ACCOUNT_HREF } from "./moreSearch";

/**
 * Screens that are opened from inside another screen, listed so search can jump straight to
 * them. Group titles match the More menu's, so a result reads the same either way.
 */
export const EXTRA_DESTINATIONS: readonly MoreMenuGroup<MoreDestination>[] = [
  {
    title: "Money",
    items: [
      { label: "Duplicates", screen: "/duplicates", keywords: ["duplicate", "double", "merge", "same transaction"] },
      { label: "Add a transaction", access: "write", screen: "/transactions/new", keywords: ["new", "enter", "manual", "expense", "income"] },
      { label: "Import bank transactions", access: "write", screen: "/transactions/import", keywords: ["csv", "statement", "upload", "bank"] },
    ],
  },
  {
    title: "Rentals",
    items: [{ label: "Review bookings", screen: "/calendar/review", keywords: ["calendar", "airbnb", "ical", "stays", "reservations"] }],
  },
  {
    title: "Leasing",
    items: [
      { label: "New lease", access: "write", screen: "/leases/new", keywords: ["create", "start", "tenant", "rent"] },
      { label: "Import a lease", access: "write", screen: "/leases/import", keywords: ["signed", "pdf", "upload", "rent"] },
    ],
  },
  {
    title: "Money tools",
    items: [
      { label: "Utility renewals", screen: "/utility-plans/renewals", keywords: ["electric", "gas", "water", "internet", "contract", "expiring"] },
      { label: "Utility rate check", screen: "/utility-plans/rate-check", keywords: ["electric", "gas", "water", "compare", "market"] },
      { label: "Better utility plans", screen: "/utility-plans/better", keywords: ["save", "cheaper", "switch", "electric"] },
      { label: "Market utility rates", screen: "/utility-plans/market-rates", keywords: ["benchmark", "electric", "gas", "water"] },
      { label: "Insurance rate watch", screen: "/insurance/rate-watch", keywords: ["premium", "renewal", "compare"] },
      { label: "Market insurance premium", screen: "/insurance/market-premium", keywords: ["premium", "compare", "benchmark"] },
      { label: "Mortgage rates", screen: "/mortgages/rates", keywords: ["refinance", "refi", "interest", "loan"] },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Sign out and devices", screen: MORE_ACCOUNT_HREF, keywords: ["log out", "logout", "sign off", "this phone", "signed in", "sessions", "other phones"] },
      { label: "Delete my account", screen: "/delete-account", keywords: ["remove", "close", "erase", "privacy"] },
    ],
  },
];
