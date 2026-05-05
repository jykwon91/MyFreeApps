/**
 * Discriminated union for what the InsurancePolicyDetail body should render.
 * Replaces the nested isLoading / isError / content ternary chain with a flat switch.
 */
export type InsurancePolicyDetailMode = "loading" | "content";
