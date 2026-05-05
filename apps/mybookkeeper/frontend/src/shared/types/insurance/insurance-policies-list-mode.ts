/**
 * Discriminated union for what the InsurancePolicies list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type InsurancePoliciesListMode = "loading" | "empty" | "list";
