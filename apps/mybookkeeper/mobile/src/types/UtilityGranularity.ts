import type { UtilityTrendsParams } from "@mybookkeeper/api-client/types/analytics/utility-trends-params";

/** How the server groups bills: "2025-03" for monthly, "2025-Q1" for quarterly. */
export type UtilityGranularity = NonNullable<UtilityTrendsParams["granularity"]>;
