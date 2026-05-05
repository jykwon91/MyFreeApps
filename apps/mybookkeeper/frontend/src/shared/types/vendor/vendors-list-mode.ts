/**
 * Discriminated union for what the Vendors list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type VendorsListMode = "loading" | "empty" | "list";
