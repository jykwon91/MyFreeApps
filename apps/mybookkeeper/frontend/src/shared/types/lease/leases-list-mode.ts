/**
 * Discriminated union for what the Leases list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type LeasesListMode = "loading" | "empty" | "list";
