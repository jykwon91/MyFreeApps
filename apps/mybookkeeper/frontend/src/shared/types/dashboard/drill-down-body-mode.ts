/**
 * Discriminated union for what the DrillDownPanel body should render.
 * Replaces a chain of nested ternaries with a flat switch.
 */
export type DrillDownBodyMode = "loading" | "empty" | "list" | "detail";
