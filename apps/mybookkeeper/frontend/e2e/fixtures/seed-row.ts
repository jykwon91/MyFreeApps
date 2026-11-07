import type { SeedPropertyIds } from "./seed-property-ids";

/** One approved transaction for ``seedTransactions`` to create. */
export interface SeedRow {
  property: keyof SeedPropertyIds;
  date: string;
  type: "income" | "expense";
  category: string;
  sub_category?: string;
  vendor: string;
  amount: string;
}
