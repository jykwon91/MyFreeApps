import type { SheetOption } from "@platform/mobile";
import type { ApplicationSort } from "../types/ApplicationSort";
import type { ApplicationSortKey } from "../types/ApplicationSortKey";

/** Every way the website's table sorts, each column both ways. The server does the sorting. */
export const APPLICATION_SORTS: Record<ApplicationSortKey, ApplicationSort> = {
  "applied-desc": { field: "applied", direction: "desc", label: "Applied, newest first" },
  "applied-asc": { field: "applied", direction: "asc", label: "Applied, oldest first" },
  "company-asc": { field: "company", direction: "asc", label: "Company, A to Z" },
  "company-desc": { field: "company", direction: "desc", label: "Company, Z to A" },
  "role-asc": { field: "role", direction: "asc", label: "Role, A to Z" },
  "role-desc": { field: "role", direction: "desc", label: "Role, Z to A" },
  "status-asc": { field: "status", direction: "asc", label: "Status, in pipeline order" },
  "status-desc": { field: "status", direction: "desc", label: "Status, reverse pipeline order" },
  "fit-desc": { field: "fit", direction: "desc", label: "Fit, highest first" },
  "fit-asc": { field: "fit", direction: "asc", label: "Fit, lowest first" },
  "location-asc": { field: "location", direction: "asc", label: "Location, A to Z" },
  "location-desc": { field: "location", direction: "desc", label: "Location, Z to A" },
  "remote-asc": { field: "remote", direction: "asc", label: "Remote, A to Z" },
  "remote-desc": { field: "remote", direction: "desc", label: "Remote, Z to A" },
};

/** In the order the sort sheet lists them. */
export const APPLICATION_SORT_KEYS: readonly ApplicationSortKey[] = [
  "applied-desc",
  "applied-asc",
  "company-asc",
  "company-desc",
  "role-asc",
  "role-desc",
  "status-asc",
  "status-desc",
  "fit-desc",
  "fit-asc",
  "location-asc",
  "location-desc",
  "remote-asc",
  "remote-desc",
];

export const APPLICATION_SORT_OPTIONS: readonly SheetOption<ApplicationSortKey>[] = APPLICATION_SORT_KEYS.map((key) => ({
  value: key,
  label: APPLICATION_SORTS[key].label,
}));

/** The server's default order, so the list opens the way the website's does. */
export const DEFAULT_APPLICATION_SORT: ApplicationSortKey = "applied-desc";
