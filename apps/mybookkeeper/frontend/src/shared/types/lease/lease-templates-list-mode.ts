/**
 * Discriminated union for what the LeaseTemplates list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type LeaseTemplatesListMode = "loading" | "empty" | "list";
