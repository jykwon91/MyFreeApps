import type { ApplicationsSort } from "../types/application/applications-sort";

/** Rows per GET /applications page. The server caps a page at 500. */
export const APPLICATIONS_PAGE_SIZE = 50;

/** The first page starts at the first row. */
export const FIRST_APPLICATIONS_OFFSET = 0;

/** Applied most recently first: the order the list has always opened in. */
export const DEFAULT_APPLICATIONS_SORT: ApplicationsSort = { sort: "applied", order: "desc" };
