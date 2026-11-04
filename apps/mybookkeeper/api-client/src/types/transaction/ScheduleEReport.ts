import type { ScheduleEProperty } from "./ScheduleEProperty";

export interface ScheduleEReport {
  tax_year: number;
  properties: ScheduleEProperty[];
  totals: Record<string, string>;
}
