import type { SheetOption } from "@platform/mobile";
import type { ApplicationSortKey } from "../types/ApplicationSortKey";
import { APPLICATION_SORTS } from "./applicationSorts";

/** Copy for the applications at a company. */
export const COMPANY_APPLICATIONS_MESSAGES = {
  heading: (companyName: string) => `Applications at ${companyName}`,
  loading: "Loading applications at this company",
  none: "No applications at this company yet.",
  couldntLoad: "I couldn't load this company's applications.",
  tryAgain: "Try again",
  sort: "Sort",
  sortTitle: "Sort applications by",
} as const;

/** The website's company table sorts by its Role, Location, Remote and Applied columns, each both ways. */
export const COMPANY_APPLICATION_SORT_KEYS: readonly ApplicationSortKey[] = [
  "applied-desc",
  "applied-asc",
  "role-asc",
  "role-desc",
  "location-asc",
  "location-desc",
  "remote-asc",
  "remote-desc",
];

export const COMPANY_APPLICATION_SORT_OPTIONS: readonly SheetOption<ApplicationSortKey>[] = COMPANY_APPLICATION_SORT_KEYS.map((key) => ({
  value: key,
  label: APPLICATION_SORTS[key].label,
}));

/** Skeleton rows while the list, a new sort of it, or its next page loads. */
export const COMPANY_APPLICATION_SKELETON_ROWS = ["a", "b", "c"] as const;
