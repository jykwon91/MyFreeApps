/**
 * Discriminated union for what the SyncLogRow funnel stats section renders.
 * Replaces a nested ternary with a single switch.
 */
export type SyncLogFunnelMode = "modern" | "legacy" | "none";
