/**
 * Discriminated union for what ApplicantsListBody should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type ApplicantsListMode = "loading" | "empty" | "list";
