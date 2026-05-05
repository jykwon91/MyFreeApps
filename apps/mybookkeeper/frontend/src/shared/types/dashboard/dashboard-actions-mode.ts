/**
 * Discriminated union for what the Dashboard page header actions renders.
 * Replaces a 3-branch stacked ternary with a flat switch.
 */
export type DashboardActionsMode = "reset" | "hint" | "none";
