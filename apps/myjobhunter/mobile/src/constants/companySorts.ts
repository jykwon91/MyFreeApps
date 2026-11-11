import type { SheetOption } from "@platform/mobile";
import type { CompanySortKey } from "../types/CompanySortKey";
import type { CompanySortOption } from "../types/CompanySortOption";

/** Every column the website's Companies table sorts, each both ways. Missing values stay last either way. */
export const COMPANY_SORTS: Record<CompanySortKey, CompanySortOption> = {
  "name-asc": { field: "name", order: "asc", label: "Name, A to Z" },
  "name-desc": { field: "name", order: "desc", label: "Name, Z to A" },
  "primary_domain-asc": { field: "primary_domain", order: "asc", label: "Domain, A to Z" },
  "primary_domain-desc": { field: "primary_domain", order: "desc", label: "Domain, Z to A" },
  "industry-asc": { field: "industry", order: "asc", label: "Industry, A to Z" },
  "industry-desc": { field: "industry", order: "desc", label: "Industry, Z to A" },
  "hq_location-asc": { field: "hq_location", order: "asc", label: "HQ, A to Z" },
  "hq_location-desc": { field: "hq_location", order: "desc", label: "HQ, Z to A" },
};

/** In the order the sort sheet lists them. */
export const COMPANY_SORT_KEYS: readonly CompanySortKey[] = [
  "name-asc",
  "name-desc",
  "primary_domain-asc",
  "primary_domain-desc",
  "industry-asc",
  "industry-desc",
  "hq_location-asc",
  "hq_location-desc",
];

export const COMPANY_SORT_OPTIONS: readonly SheetOption<CompanySortKey>[] = COMPANY_SORT_KEYS.map((key) => ({
  value: key,
  label: COMPANY_SORTS[key].label,
}));

/** The server's order, so the list opens the way the website's does. */
export const DEFAULT_COMPANY_SORT: CompanySortKey = "name-asc";
