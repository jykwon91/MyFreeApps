/**
 * Discriminated union for what the Tenants list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type TenantsListMode = "loading" | "empty" | "list";
