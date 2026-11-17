import { ANALYTICS_TABS } from "@/shared/lib/analytics-tabs";
import type { AnalyticsTabKey } from "@/shared/types/analytics/analytics-tab-key";

export function isAnalyticsTabKey(value: string | null): value is AnalyticsTabKey {
  return ANALYTICS_TABS.some((tab) => tab.key === value);
}
