/**
 * Discriminated union for what the ReconciliationWizard sources step renders.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type ReconciliationSourcesMode = "loading" | "empty" | "list";
