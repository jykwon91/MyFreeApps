/**
 * Discriminated union for what the Dashboard page header subtitle renders.
 * Replaces a 3-branch stacked ternary with a flat switch.
 */
export type DashboardSubtitleMode = "date-range" | "health-warning" | "none";
