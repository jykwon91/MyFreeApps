import type { SortingState } from "@platform/ui";

/**
 * The server's default order (applied, newest first) as table sorting, so the
 * Applied header shows the order the rows actually arrive in. Module-level, so
 * its identity is stable across renders.
 */
export const DEFAULT_APPLICATIONS_TABLE_SORTING: SortingState = [{ id: "applied_at", desc: true }];
