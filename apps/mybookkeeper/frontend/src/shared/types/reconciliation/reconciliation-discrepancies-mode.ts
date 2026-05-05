/**
 * Discriminated union for what the ReconciliationWizard discrepancies step renders.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type ReconciliationDiscrepanciesMode = "loading" | "empty" | "list";
