import type { UtilityTrendPoint } from "./utility-trend-point";

export interface UtilityTrendsResponse {
  trends: UtilityTrendPoint[];
  summary: Record<string, number>;
  total_spend: number;
}
