import type { ApplicationsFilter } from "./applications-filter";
import type { ApplicationsSort } from "./applications-sort";

/** Everything that picks which applications, in what order; the page is the offset on top. */
export type ApplicationsListQuery = ApplicationsFilter & ApplicationsSort;
