/**
 * Discriminated union for what the Inquiries list body should render.
 * Replaces the isLoading / empty / list ternary chain with a flat switch.
 */
export type InquiriesListMode = "loading" | "empty" | "list";
