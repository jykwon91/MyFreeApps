/**
 * Discriminated union for what MergeFieldPicker body should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type MergeFieldPickerMode = "no-conflicts" | "date-only" | "conflicts";
