/**
 * Discriminated union for what the UtilityPlans list body should render.
 * Keeps the body a flat switch instead of a ternary chain.
 */
export type UtilityPlansListMode = "loading" | "empty" | "list";
