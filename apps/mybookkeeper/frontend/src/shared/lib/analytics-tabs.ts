import type { AnalyticsTabKey } from "@/shared/types/analytics/analytics-tab-key";

/** Analytics page tabs, in display order. */
export const ANALYTICS_TABS: readonly { key: AnalyticsTabKey; label: string }[] = [
  { key: "rental-roi", label: "Rental ROI" },
  { key: "utility-trends", label: "Utility Trends" },
];

export const DEFAULT_ANALYTICS_TAB: AnalyticsTabKey = "rental-roi";
