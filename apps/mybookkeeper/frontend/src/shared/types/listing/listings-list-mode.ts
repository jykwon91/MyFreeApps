/**
 * Discriminated union for what the Listings list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type ListingsListMode = "loading" | "empty" | "list";
