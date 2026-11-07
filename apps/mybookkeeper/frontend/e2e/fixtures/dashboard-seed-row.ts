import type { DashboardPropertyIds } from "./dashboard-property-ids";

/** One approved transaction to seed into a dashboard organization. */
export interface DashboardSeedRow {
  property: keyof DashboardPropertyIds;
  date: string;
  type: "income" | "expense";
  category: string;
  vendor: string;
  amount: string;
}
